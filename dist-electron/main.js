import { ipcMain, dialog, shell, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
function buildSystemPrompt(ctx) {
  const root = ctx.projectPath ?? "(no folder open)";
  return `You are Celestia Agent, an expert coding assistant embedded in the Celestia IDE.

## Environment
- Project root: ${root}
- Active file: ${ctx.activeFile ?? "none"}
- Open tabs: ${ctx.openFiles.length ? ctx.openFiles.join(", ") : "none"}
- All file paths are relative to project root unless they are absolute.

## Tool rules — follow these exactly, no exceptions

### Reading files
- ALWAYS call read_file before edit_file, even if you think you know the content.
- The only exception: if the file content is already provided in this prompt under "## Referenced files".
- Never invent or assume file contents. If you haven't read it, read it.

### Editing files
- Use edit_file for partial changes. Use write_file only to create a new file or completely replace one.
- old_string must be an EXACT match — copy it character-for-character from the read_file output.
- old_string must be unique in the file. If the string appears multiple times, add more surrounding lines to make it unique.
- If edit_file returns "old_string not found": call read_file again immediately, find the correct text, then retry edit_file.
- If edit_file returns "matches N times": expand old_string to include more surrounding context and retry.
- Never give up after a tool error. Always diagnose and retry.

### Paths
- Use relative paths from project root (e.g. \`ui/Sidebar.tsx\`, not the full absolute path).
- Never append extra text to paths. Paths are filenames only.
- NEVER prefix file paths with @. The @ symbol is only used by the user in their messages to reference files.
  - Correct: \`parser/Parser.kt\`
  - Wrong: \`@parser/Parser.kt\`
- Do not prefix file paths with @, the @ is how the user references files in their messages, not part of the path itself.

### Tool call discipline
- One logical action per tool call. Wait for the result before proceeding.
- Do not fabricate tool results. If a tool errors, handle the error.
- After all tool calls are done, write a short summary of what changed.

## Response format
- Be concise. Prefer correct small changes over long explanations.
- Do not over explain. The user can ask follow-up questions if they want more details; however, always explain your reasoning in your head before making a tool call, to ensure you choose the right tool and arguments.
- Use markdown: \`inline code\`, \`\`\`language\`\`\` blocks, **bold** for emphasis.
- When referencing existing code, cite the file path.
- Do not paste large code blocks in your reply if you've already written them to files via tools.`;
}
function computeLineDiff(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i2 = m - 1; i2 >= 0; i2--) {
    for (let j2 = n - 1; j2 >= 0; j2--) {
      dp[i2][j2] = a[i2] === b[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: "same", line: a[i], lineNo: i + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "remove", line: a[i], lineNo: i + 1 });
      i++;
    } else {
      out.push({ type: "add", line: b[j], lineNo: j + 1 });
      j++;
    }
  }
  while (i < m) {
    out.push({ type: "remove", line: a[i], lineNo: i + 1 });
    i++;
  }
  while (j < n) {
    out.push({ type: "add", line: b[j], lineNo: j + 1 });
    j++;
  }
  return out;
}
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read file contents. Use relative path from project root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          start_line: { type: "number", description: "Optional 1-based start line" },
          end_line: { type: "number", description: "Optional 1-based end line" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace exact text in a file. old_string must match exactly once.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" }
        },
        required: ["path", "old_string", "new_string"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite entire file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and folders in a directory.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: 'Directory path, default "."' } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_codebase",
      description: "Search for regex pattern in project files.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          glob: { type: "string", description: "Optional extension filter e.g. ts, py" }
        },
        required: ["pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "summarize_file",
      description: "Get file metadata and a short preview for large files.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for documentation, errors, or APIs.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  }
];
function resolvePath(ctx, filePath) {
  if (!ctx.projectPath) return null;
  if (filePath === "." || filePath === "./") return ctx.projectPath;
  if (path.isAbsolute(filePath)) {
    const norm = path.normalize(filePath);
    if (!norm.startsWith(path.normalize(ctx.projectPath))) return null;
    return norm;
  }
  return path.normalize(path.join(ctx.projectPath, filePath));
}
function readTextFile(abs) {
  if (!fs.existsSync(abs)) return { ok: false, msg: "File not found" };
  const buf = fs.readFileSync(abs);
  if (buf.includes(0)) return { ok: false, msg: "Binary file — cannot read as text" };
  return { ok: true, content: buf.toString("utf8") };
}
function walkDir(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, out);
    else out.push(p);
  }
  return out;
}
async function webSearch(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`;
    const res = await fetch(url, { headers: { "User-Agent": "CelestiaAgent/1.0" } });
    if (!res.ok) return `Search failed: HTTP ${res.status}`;
    const data = await res.json();
    const parts = [];
    if (data.AbstractText) parts.push(data.AbstractText, data.AbstractURL ?? "");
    const topics = data.RelatedTopics ?? [];
    for (const t of topics.slice(0, 5)) {
      if ("Text" in t && t.Text) parts.push(`• ${t.Text}`);
      if ("Topics" in t && t.Topics) {
        for (const sub of t.Topics.slice(0, 3)) {
          if (sub.Text) parts.push(`• ${sub.Text}`);
        }
      }
    }
    return parts.filter(Boolean).join("\n") || "No results found.";
  } catch (err) {
    return `Search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
async function executeTool(name, args, ctx) {
  switch (name) {
    case "read_file": {
      const abs = resolvePath(ctx, String(args.path ?? "").split(":")[0]);
      if (!abs) return { ok: false, output: "Invalid path or no project open" };
      const fromOpen = ctx.openFileContents.get(abs);
      const raw = fromOpen ?? (() => {
        const r = readTextFile(abs);
        return r.ok ? r.content : null;
      })();
      if (raw === null) {
        const r = readTextFile(abs);
        return { ok: false, output: r.ok ? "" : r.msg };
      }
      const lines = raw.split("\n");
      const start = Math.max(1, Number(args.start_line) || 1);
      const end = Math.min(lines.length, Number(args.end_line) || lines.length);
      const slice = lines.slice(start - 1, end);
      const numbered = slice.map((l, i) => `${start + i}|${l}`).join("\n");
      return { ok: true, output: numbered, filePath: abs };
    }
    case "edit_file": {
      const abs = resolvePath(ctx, String(args.path ?? ""));
      if (!abs) return { ok: false, output: "Invalid path" };
      const r = readTextFile(abs);
      if (!r.ok) return { ok: false, output: r.msg };
      const oldStr = String(args.old_string ?? "");
      const newStr = String(args.new_string ?? "");
      const count = r.content.split(oldStr).length - 1;
      if (count === 0) return { ok: false, output: "old_string not found in file" };
      if (count > 1) return { ok: false, output: `old_string matches ${count} times — must be unique` };
      const updated = r.content.replace(oldStr, newStr);
      fs.writeFileSync(abs, updated, "utf8");
      ctx.openFileContents.set(abs, updated);
      return {
        ok: true,
        output: `Edited ${args.path}`,
        diff: computeLineDiff(r.content, updated),
        filePath: abs,
        filesChanged: true
      };
    }
    case "write_file": {
      const abs = resolvePath(ctx, String(args.path ?? ""));
      if (!abs) return { ok: false, output: "Invalid path" };
      const content = String(args.content ?? "");
      const before = fs.existsSync(abs) ? readTextFile(abs) : null;
      const oldContent = (before == null ? void 0 : before.ok) ? before.content : "";
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
      ctx.openFileContents.set(abs, content);
      return {
        ok: true,
        output: `Wrote ${args.path}`,
        diff: oldContent !== content ? computeLineDiff(oldContent, content) : void 0,
        filePath: abs,
        filesChanged: true
      };
    }
    case "list_directory": {
      const rel = String(args.path ?? ".");
      const abs = resolvePath(ctx, rel === "." ? "." : rel);
      if (!abs || !fs.existsSync(abs)) return { ok: false, output: "Directory not found" };
      const entries = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => !e.name.startsWith(".")).map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`);
      return { ok: true, output: entries.join("\n") || "(empty)" };
    }
    case "search_codebase": {
      if (!ctx.projectPath) return { ok: false, output: "No project open" };
      const pattern = String(args.pattern ?? "");
      const ext = args.glob ? String(args.glob).replace(/^\./, "") : null;
      let re;
      try {
        re = new RegExp(pattern, "gi");
      } catch {
        return { ok: false, output: "Invalid regex pattern" };
      }
      const hits = [];
      for (const file of walkDir(ctx.projectPath)) {
        if (ext && !file.endsWith(`.${ext}`)) continue;
        const r = readTextFile(file);
        if (!r.ok) continue;
        const rel = path.relative(ctx.projectPath, file);
        r.content.split("\n").forEach((line, i) => {
          if (re.test(line)) {
            hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
            re.lastIndex = 0;
          }
        });
        if (hits.length >= 40) break;
      }
      return { ok: true, output: hits.join("\n") || "No matches" };
    }
    case "summarize_file": {
      const abs = resolvePath(ctx, String(args.path ?? ""));
      if (!abs) return { ok: false, output: "Invalid path" };
      const r = readTextFile(abs);
      if (!r.ok) return { ok: false, output: r.msg };
      const lines = r.content.split("\n");
      const preview = lines.slice(0, 30).map((l, i) => `${i + 1}|${l}`).join("\n");
      const summary = [
        `Path: ${args.path}`,
        `Lines: ${lines.length}`,
        `Chars: ${r.content.length}`,
        `Preview (first 30 lines):`,
        preview,
        lines.length > 30 ? `
... ${lines.length - 30} more lines` : ""
      ].join("\n");
      return { ok: true, output: summary, filePath: abs };
    }
    case "web_search": {
      const out = await webSearch(String(args.query ?? ""));
      return { ok: true, output: out };
    }
    default:
      return { ok: false, output: `Unknown tool: ${name}` };
  }
}
const OLLAMA = "http://127.0.0.1:11434/api/chat";
const MAX_STEPS = 20;
const MAX_CONSECUTIVE_ERRORS = 3;
function parseToolArgs(raw) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw;
  return {};
}
function extractFallbackToolCalls(text) {
  const calls = [];
  const re = /```(?:json|tool)?\s*(\{[\s\S]*?\})\s*```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      const name = obj.tool ?? obj.name;
      if (name) calls.push({ name, args: obj.args ?? obj.arguments ?? obj.parameters ?? {} });
    } catch {
    }
  }
  return calls;
}
async function ollamaChat(model, messages, useTools) {
  const body = { model, messages, stream: false };
  if (useTools) body.tools = AGENT_TOOLS;
  const res = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text() || `Ollama ${res.status}`);
  let result = await res.json();
  console.log(result);
  return result;
}
function buildErrorGuidance(toolName, errorOutput, args) {
  if (toolName === "edit_file") {
    if (errorOutput.includes("not found")) {
      return `
ACTION REQUIRED: The old_string you provided was not found verbatim in the file.
Steps to fix:
1. Call read_file on "${String(args.path ?? "")}" right now to get the exact current content.
2. Copy the exact text you want to replace, character-for-character, from the read_file output.
3. Retry edit_file with that exact text as old_string.
Do not guess — use only text from the read_file result.`;
    }
    if (errorOutput.includes("matches")) {
      return `
ACTION REQUIRED: old_string is not unique — it appears multiple times.
Add more surrounding lines to old_string to make it uniquely identify the location, then retry.`;
    }
  }
  if (toolName === "read_file" || toolName === "summarize_file") {
    if (errorOutput.includes("not found")) {
      return `
The file path may be wrong. Call list_directory to find the correct path, then retry.`;
    }
  }
  return `
This was an error. Diagnose the problem and retry or take an alternative approach.`;
}
async function runAgent(req) {
  var _a;
  const toolEvents = [];
  let filesChanged = false;
  let toolId = 0;
  let consecutiveErrors = 0;
  const openMap = /* @__PURE__ */ new Map();
  for (const f of req.openFiles) openMap.set(f.path, f.content);
  for (const f of req.referencedFiles) openMap.set(f.path, f.content);
  const ctx = {
    projectPath: req.projectPath,
    openFileContents: openMap
  };
  const refSection = req.referencedFiles.length ? `

## Referenced files
The user has explicitly attached these files. Treat their content as authoritative and current — you do not need to read_file them unless you need content beyond what is shown here.

${req.referencedFiles.map((f) => {
    const relPath = req.projectPath && f.path.startsWith(req.projectPath) ? f.path.slice(req.projectPath.length).replace(/^[/\\]/, "").replace(/\\/g, "/") : f.path.replace(/\\/g, "/");
    return `### ${relPath}
\`\`\`
${f.content.slice(0, 8e3)}
\`\`\``;
  }).join("\n\n")}` : "";
  const systemContent = buildSystemPrompt({
    projectPath: req.projectPath,
    openFiles: req.openFiles.map((f) => f.path),
    activeFile: req.activeFilePath
  }) + refSection;
  const messages = [
    { role: "system", content: systemContent },
    ...req.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: req.userMessage }
  ];
  let finalContent = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      const { message: final } = await ollamaChat(req.model, [
        ...messages,
        {
          role: "user",
          content: "You have hit repeated errors. Stop using tools and give your best answer or explanation of what went wrong."
        }
      ], false);
      finalContent = final.content ?? "Encountered repeated tool errors and could not complete the task.";
      break;
    }
    const useTools = step < MAX_STEPS - 1;
    const { message } = await ollamaChat(req.model, messages, useTools);
    let toolCalls = ((_a = message.tool_calls) == null ? void 0 : _a.map((tc) => ({
      name: tc.function.name,
      args: parseToolArgs(tc.function.arguments)
    }))) ?? [];
    if (toolCalls.length === 0 && message.content) {
      toolCalls = extractFallbackToolCalls(message.content);
    }
    if (toolCalls.length === 0) {
      finalContent = message.content ?? "";
      break;
    }
    messages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls
    });
    for (const call of toolCalls) {
      const id = `tool-${++toolId}`;
      const ev = { id, name: call.name, args: call.args, status: "running" };
      toolEvents.push(ev);
      try {
        const result = await executeTool(call.name, call.args, ctx);
        ev.status = result.ok ? "done" : "error";
        ev.output = result.output;
        ev.diff = result.diff;
        ev.filePath = result.filePath;
        if (result.filesChanged) filesChanged = true;
        if (!result.ok) {
          consecutiveErrors++;
          const guidance = buildErrorGuidance(call.name, result.output, call.args);
          messages.push({
            role: "tool",
            tool_name: call.name,
            content: `ERROR: ${result.output}${guidance}`
          });
        } else {
          consecutiveErrors = 0;
          messages.push({
            role: "tool",
            tool_name: call.name,
            content: result.output
          });
        }
      } catch (err) {
        consecutiveErrors++;
        ev.status = "error";
        ev.output = err instanceof Error ? err.message : String(err);
        messages.push({
          role: "tool",
          tool_name: call.name,
          content: `ERROR: ${ev.output}
Diagnose and retry.`
        });
      }
    }
  }
  if (!finalContent) {
    const { message: final } = await ollamaChat(req.model, messages, false);
    finalContent = final.content ?? "Done.";
  }
  return { content: finalContent, toolEvents, filesChanged };
}
async function setupRichPresence() {
  const DiscordRPC = await import("./index-C2lbYB88.js").then((n) => n.i);
  const clientId = "1512915399514128554";
  const client = new DiscordRPC.Client({ transport: "ipc" });
  const openedTime = Date.now();
  let isReady = false;
  client.on("ready", () => {
    isReady = true;
    client.setActivity({
      details: "Browsing Projects...",
      startTimestamp: openedTime,
      largeImageKey: "celestia-logo-tiny_1_",
      largeImageText: "Celestia IDE"
    });
  });
  await client.login({ clientId });
  ipcMain.on("rich-presence:set", async (_event, { details, state, projectName, smallImageKey }) => {
    if (!isReady) return;
    client.setActivity({
      details,
      state,
      startTimestamp: openedTime,
      largeImageKey: "celestia-logo-tiny_1_",
      largeImageText: "Celestia IDE" + (projectName ? ` - ${projectName}` : ""),
      smallImageKey: smallImageKey || void 0,
      smallImageText: smallImageKey ? projectName || "Project" : void 0
    });
  });
  ipcMain.on("rich-presence:clear", async () => {
    if (!isReady) return;
    client.clearActivity();
  });
}
setupRichPresence().catch(console.error);
const require$1 = createRequire(import.meta.url);
const pty = require$1("node-pty");
const AdmZip = require$1("adm-zip");
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
const ptyProcesses = /* @__PURE__ */ new Map();
const ARCHIVE_EXTS = /* @__PURE__ */ new Set(["zip", "jar", "war", "ear"]);
const TEXT_EXTS = /* @__PURE__ */ new Set([
  "txt",
  "md",
  "json",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "java",
  "kt",
  "kts",
  "st",
  "css",
  "html",
  "sh",
  "ps1",
  "bat",
  "cmd",
  "gradle",
  "properties",
  "gitignore",
  "env",
  "csv",
  "sql",
  "rs",
  "go",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "rb",
  "php",
  "lua",
  "vue",
  "svelte",
  "svg",
  "log",
  "stella"
]);
function isArchivePath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return ARCHIVE_EXTS.has(ext);
}
function isLikelyBinary(buf) {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.includes(0)) return true;
  const text = sample.toString("utf8");
  const bad = (text.match(/\uFFFD/g) ?? []).length;
  return bad > sample.length * 0.02;
}
function archiveUri(archivePath, entryPath = "") {
  return `archive://${archivePath}#${entryPath.replace(/\\/g, "/")}`;
}
function parseArchiveUri(uri) {
  const match = uri.match(/^archive:\/\/(.+?)#(.*)$/);
  if (!match) return null;
  return { archivePath: match[1], entryPath: match[2] };
}
function buildArchiveTree(archivePath) {
  const zip = new AdmZip(archivePath);
  const root = /* @__PURE__ */ new Map();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const parts = entry.entryName.replace(/\\/g, "/").split("/").filter(Boolean);
    let currentPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const entryPath = currentPath ? `${currentPath}/${part}` : part;
      const nodePath = archiveUri(archivePath, isFile ? entry.entryName : entryPath);
      if (!root.has(entryPath)) {
        root.set(entryPath, {
          name: part,
          path: nodePath,
          isDirectory: !isFile,
          isArchive: false,
          children: isFile ? void 0 : []
        });
      }
      if (!isFile) {
        currentPath = entryPath;
      }
    }
  }
  const nodes = [...root.values()];
  const topLevel = [];
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  for (const node of nodes) {
    const parsed = parseArchiveUri(node.path);
    if (!parsed) continue;
    const parts = parsed.entryPath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length <= 1) {
      topLevel.push(node);
    } else {
      const parentEntry = parts.slice(0, -1).join("/");
      const parentPath = archiveUri(parsed.archivePath, parentEntry);
      const parent = byPath.get(parentPath);
      if (parent) {
        parent.isDirectory = true;
        parent.children ?? (parent.children = []);
        if (!parent.children.some((c) => c.path === node.path)) {
          parent.children.push(node);
        }
      } else {
        topLevel.push(node);
      }
    }
  }
  const deduped = /* @__PURE__ */ new Map();
  for (const n of topLevel) deduped.set(n.path, n);
  return [...deduped.values()].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(process.env.VITE_PUBLIC, "assets/celestia-logo-tiny.ico"),
    backgroundColor: "#1a1a1a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.once("ready-to-show", () => win == null ? void 0 : win.show());
  attachWindowStateEvents();
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.on("window:minimize", () => win == null ? void 0 : win.minimize());
ipcMain.on("window:maximize", () => {
  if (win == null ? void 0 : win.isMaximized()) win.unmaximize();
  else win == null ? void 0 : win.maximize();
});
ipcMain.on("window:close", () => win == null ? void 0 : win.close());
ipcMain.handle("window:isMaximized", () => (win == null ? void 0 : win.isMaximized()) ?? false);
function attachWindowStateEvents() {
  win == null ? void 0 : win.on("maximize", () => win == null ? void 0 : win.webContents.send("window:maximized"));
  win == null ? void 0 : win.on("unmaximize", () => win == null ? void 0 : win.webContents.send("window:unmaximized"));
  win == null ? void 0 : win.webContents.on("before-input-event", (event, input) => {
    if (input.control && input.key === "s") {
      event.preventDefault();
      win == null ? void 0 : win.webContents.send("save-file");
    }
  });
}
ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      { name: "Stella", extensions: ["st"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("fs:readDir", async (_e, dirPath) => {
  const readDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.filter((e) => !e.name.startsWith(".") && e.name !== "node_modules").sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    }).map((e) => {
      const fullPath = path.join(dir, e.name);
      if (isArchivePath(fullPath)) {
        return {
          name: e.name,
          path: archiveUri(fullPath),
          isDirectory: true,
          isArchive: true
        };
      }
      return {
        name: e.name,
        path: fullPath,
        isDirectory: e.isDirectory(),
        isArchive: false,
        children: e.isDirectory() ? readDir(fullPath) : void 0
      };
    });
  };
  return readDir(dirPath);
});
ipcMain.handle("fs:readArchiveTree", async (_e, uriOrPath) => {
  const parsed = parseArchiveUri(uriOrPath);
  const archivePath = (parsed == null ? void 0 : parsed.archivePath) ?? uriOrPath;
  if (!fs.existsSync(archivePath)) return [];
  return buildArchiveTree(archivePath);
});
ipcMain.handle("fs:readFile", async (_e, filePath) => {
  const { execFile } = await import("node:child_process");
  const CFR_JAR = path.join(process.env.APP_ROOT, "resources", "cfr.jar");
  const decompileClass = (classPath) => new Promise((resolve) => {
    execFile("java", ["-jar", CFR_JAR, classPath], (err, stdout, stderr) => {
      if (err && !stdout) resolve({ kind: "text", content: `// decompile failed: ${stderr || err.message}` });
      else resolve({ kind: "text", content: stdout });
    });
  });
  const parsed = parseArchiveUri(filePath);
  if (parsed) {
    const zip = new AdmZip(parsed.archivePath);
    const entry = zip.getEntry(parsed.entryPath);
    if (!entry) return { kind: "error", message: "Entry not found in archive" };
    const buf2 = entry.getData();
    const ext2 = path.extname(parsed.entryPath).slice(1).toLowerCase();
    if (ext2 === "class") {
      const tmp = path.join(os.tmpdir(), path.basename(parsed.entryPath));
      fs.writeFileSync(tmp, buf2);
      const result = await decompileClass(tmp);
      fs.rmSync(tmp, { force: true });
      return result;
    }
    if (isLikelyBinary(buf2) && !TEXT_EXTS.has(ext2)) {
      return {
        kind: "binary",
        message: `Binary file inside archive (${parsed.entryPath}) — cannot display in editor`
      };
    }
    return { kind: "text", content: buf2.toString("utf8") };
  }
  const buf = fs.readFileSync(filePath);
  if (isArchivePath(filePath)) {
    return { kind: "archive", message: "Archive — expand in explorer to browse contents" };
  }
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === "class") {
    return await decompileClass(filePath);
  }
  if (isLikelyBinary(buf)) {
    return {
      kind: "binary",
      message: "Binary-encoded file — cannot display in editor"
    };
  }
  return { kind: "text", content: buf.toString("utf8") };
});
ipcMain.handle("fs:writeFile", async (_e, filePath, content) => {
  if (filePath.startsWith("archive://")) return false;
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
});
ipcMain.handle("fs:createFile", async (_e, filePath) => {
  fs.writeFileSync(filePath, "", "utf-8");
  return true;
});
ipcMain.handle("fs:createDir", async (_e, dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return true;
});
ipcMain.handle("fs:rename", async (_e, oldPath, newPath) => {
  fs.renameSync(oldPath, newPath);
  return true;
});
ipcMain.handle("fs:delete", async (_e, targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
});
ipcMain.handle("fs:exists", async (_e, targetPath) => {
  return fs.existsSync(targetPath);
});
ipcMain.handle("shell:showItemInFolder", async (_e, targetPath) => {
  const parsed = parseArchiveUri(targetPath);
  shell.showItemInFolder((parsed == null ? void 0 : parsed.archivePath) ?? targetPath);
  return true;
});
ipcMain.handle("terminal:create", async (_e, id, cwd) => {
  try {
    const shellCmd = process.platform === "win32" ? "powershell.exe" : process.env.SHELL ?? "bash";
    const proc = pty.spawn(shellCmd, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: cwd ?? os.homedir(),
      env: process.env
    });
    proc.onData((data) => win == null ? void 0 : win.webContents.send(`terminal:data:${id}`, data));
    proc.onExit(() => {
      win == null ? void 0 : win.webContents.send(`terminal:exit:${id}`);
      ptyProcesses.delete(id);
    });
    ptyProcesses.set(id, proc);
    return true;
  } catch (err) {
    console.error("terminal:create failed", err);
    return false;
  }
});
ipcMain.on("terminal:write", (_e, id, data) => {
  var _a;
  (_a = ptyProcesses.get(id)) == null ? void 0 : _a.write(data);
});
ipcMain.on("terminal:resize", (_e, id, cols, rows) => {
  var _a;
  (_a = ptyProcesses.get(id)) == null ? void 0 : _a.resize(cols, rows);
});
ipcMain.on("terminal:kill", (_e, id) => {
  var _a;
  (_a = ptyProcesses.get(id)) == null ? void 0 : _a.kill();
  ptyProcesses.delete(id);
});
ipcMain.handle("ollama:chat", async (_e, payload) => {
  var _a;
  const res = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: payload.model, messages: payload.messages, stream: false })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Ollama error ${res.status}`);
  }
  const data = await res.json();
  return ((_a = data.message) == null ? void 0 : _a.content) ?? "";
});
ipcMain.handle("ollama:listModels", async () => {
  var _a;
  const res = await fetch("http://127.0.0.1:11434/api/tags");
  if (!res.ok) throw new Error("Ollama not reachable");
  const data = await res.json();
  return ((_a = data.models) == null ? void 0 : _a.map((m) => m.name)) ?? [];
});
ipcMain.handle("agent:run", async (_e, payload) => runAgent(payload));
ipcMain.handle("stella:compile", async (_e, filePath, outputDir) => {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile("stella", ["compile", filePath, "-o", path.join(outputDir, "out.jar")], (err, stdout, stderr) => {
      resolve({ success: !err, stdout, stderr });
    });
  });
});
app.on("window-all-closed", () => {
  ptyProcesses.forEach((p) => p.kill());
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
