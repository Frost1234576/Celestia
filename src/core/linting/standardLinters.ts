import * as monaco from 'monaco-editor'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function marker(
  severity: monaco.MarkerSeverity,
  line: number,
  col: number,
  len: number,
  message: string,
  source: string,
): monaco.editor.IMarkerData {
  return {
    severity,
    message,
    startLineNumber: line,
    startColumn: col,
    endLineNumber: line,
    endColumn: col + len,
    source,
  }
}

/** Walk every character of every line and match unbalanced bracket pairs. */
export function lintBrackets(
  model: monaco.editor.ITextModel,
  source: string,
  /** Characters to ignore (e.g. string delimiters already stripped). */
  skip: Set<string> = new Set(),
): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const stack: { char: string; line: number; col: number }[] = []
  const openers = new Set(['(', '[', '{'])
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

  const lines = model.getValue().split('\n')
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci]
      if (skip.has(ch)) continue
      if (openers.has(ch)) {
        stack.push({ char: ch, line: li + 1, col: ci + 1 })
      } else if (ch in pairs) {
        const last = stack.pop()
        if (!last || last.char !== pairs[ch]) {
          markers.push(marker(monaco.MarkerSeverity.Error, li + 1, ci + 1, 1, `Unexpected '${ch}'`, source))
        }
      }
    }
  }

  for (const unclosed of stack) {
    markers.push(marker(monaco.MarkerSeverity.Error, unclosed.line, unclosed.col, 1, `Unclosed '${unclosed.char}'`, source))
  }
  return markers
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

export function lintJson(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const text = model.getValue()
  if (!text.trim()) return []
  try {
    JSON.parse(text)
    return []
  } catch (err) {
    // Extract line/column from the error message when available (V8 format).
    const msg = err instanceof Error ? err.message : 'Invalid JSON'
    const pos = msg.match(/line (\d+) column (\d+)/)
    const line = pos ? parseInt(pos[1]) : 1
    const col  = pos ? parseInt(pos[2]) : 1
    return [marker(monaco.MarkerSeverity.Error, line, col, 1, msg, 'json-lint')]
  }
}

// ─── Python ───────────────────────────────────────────────────────────────────

export function lintPython(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')

  // Track `def` / `class` blocks so we can warn about missing docstrings.
  let prevWasDefOrClass = false

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    // Strip inline comments for most checks (but keep original for display).
    const noComment = raw.replace(/#.*$/, '')
    const trimmed = raw.trim()

    // ── Tabs ──────────────────────────────────────────────────────────────
    if (/\t/.test(raw) && trimmed) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, 1, raw.indexOf('\t') + 2, 'Use spaces instead of tabs (PEP 8)', 'python-lint'))
    }

    // ── Indentation multiple of 4 ─────────────────────────────────────────
    const leadingSpaces = raw.match(/^( +)/)?.[1].length ?? 0
    if (leadingSpaces % 4 !== 0 && trimmed) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, 1, leadingSpaces + 1, `Indentation (${leadingSpaces}) is not a multiple of 4`, 'python-lint'))
    }

    // ── Missing colon after block statement ───────────────────────────────
    if (/^\s*(if|elif|else|for|while|def|class|with|try|except|finally)\b/.test(raw)) {
      const stripped = noComment.trimEnd()
      if (stripped && !stripped.endsWith(':') && !stripped.endsWith('\\') && !stripped.endsWith(',')) {
        const kw = raw.match(/(if|elif|else|for|while|def|class|with|try|except|finally)/)
        const col = kw ? raw.indexOf(kw[0]) + 1 : 1
        markers.push(marker(monaco.MarkerSeverity.Error, lineNo, col, (kw?.[0].length ?? 1), `Missing ':' at end of '${kw?.[0]}' block`, 'python-lint'))
      }
    }

    // ── Bare except ───────────────────────────────────────────────────────
    if (/^\s*except\s*:\s*(#.*)?$/.test(raw)) {
      const col = raw.indexOf('except') + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 6, "Bare 'except' catches all exceptions including KeyboardInterrupt", 'python-lint'))
    }

    // ── Mutable default arguments ─────────────────────────────────────────
    if (/def\s+\w+\s*\([^)]*=\s*(\[\]|\{\}|set\(\))/.test(raw)) {
      const col = raw.search(/=\s*(\[\]|\{\}|set\(\))/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 2, 'Mutable default argument — use None and assign inside the function', 'python-lint'))
    }

    // ── == None / != None instead of is / is not ──────────────────────────
    const noneEq = raw.match(/(==|!=)\s*None/)
    if (noneEq) {
      const col = raw.indexOf(noneEq[0]) + 1
      const op = noneEq[1] === '==' ? 'is' : 'is not'
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, noneEq[0].length, `Use '${op} None' for None comparisons`, 'python-lint'))
    }

    // ── == True / == False ────────────────────────────────────────────────
    const boolEq = raw.match(/(==|!=)\s*(True|False)/)
    if (boolEq) {
      const col = raw.indexOf(boolEq[0]) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, boolEq[0].length, 'Avoid comparing to True/False with ==; use the value directly', 'python-lint'))
    }

    // ── Trailing whitespace ───────────────────────────────────────────────
    if (/\s+$/.test(raw)) {
      const trailStart = raw.search(/\s+$/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, trailStart, raw.length - trailStart + 2, 'Trailing whitespace', 'python-lint'))
    }

    // ── Missing docstring hint ────────────────────────────────────────────
    if (prevWasDefOrClass && trimmed && !trimmed.startsWith('"""') && !trimmed.startsWith("'''") && !trimmed.startsWith('#')) {
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, 1, 1, 'Consider adding a docstring to document this function/class', 'python-lint'))
    }
    prevWasDefOrClass = /^\s*(def|class)\s/.test(raw)

    // ── print() ──────────────────────────────────────────────────────────
    if (/\bprint\s*\(/.test(raw) && !/^\s*#/.test(raw)) {
      const col = raw.search(/\bprint\s*\(/) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 5, 'Debug print() — consider using logging', 'python-lint'))
    }
  })

  return [...markers, ...lintBrackets(model, 'python-lint')]
}

// ─── JavaScript / TypeScript ──────────────────────────────────────────────────

function lintJS(model: monaco.editor.ITextModel, source: string): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('//')) return

    // ── var usage ─────────────────────────────────────────────────────────
    if (/\bvar\s+/.test(raw)) {
      const col = raw.search(/\bvar\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 3, "Prefer 'const' or 'let' over 'var'", source))
    }

    // ── == instead of === ─────────────────────────────────────────────────
    // Avoid matching ==>, ===
    const looseEq = raw.match(/[^=!<>]={2}(?!=)/)
    if (looseEq) {
      const col = raw.indexOf(looseEq[0]) + 2
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 2, "Use '===' for strict equality", source))
    }
    const looseNeq = raw.match(/!={1}(?!=)/)
    if (looseNeq) {
      const col = raw.indexOf(looseNeq[0]) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 2, "Use '!==' for strict inequality", source))
    }

    // ── console.log ───────────────────────────────────────────────────────
    if (/\bconsole\.(log|warn|error|debug)\s*\(/.test(raw)) {
      const col = raw.search(/\bconsole\./) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 7, 'Debug console statement', source))
    }

    // ── eval() ────────────────────────────────────────────────────────────
    if (/\beval\s*\(/.test(raw)) {
      const col = raw.search(/\beval\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 4, 'Avoid eval() — security risk and performance issue', source))
    }

    // ── debugger ─────────────────────────────────────────────────────────
    if (/\bdebugger\b/.test(raw)) {
      const col = raw.search(/\bdebugger\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 8, 'Remove debugger statement before committing', source))
    }

    // ── Trailing whitespace ───────────────────────────────────────────────
    if (/\s+$/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, raw.search(/\s+$/) + 1, 1, 'Trailing whitespace', source))
    }
  })

  return [...markers, ...lintBrackets(model, source)]
}

export const lintJavaScript = (model: monaco.editor.ITextModel) => lintJS(model, 'js-lint')
export const lintTypeScript  = (model: monaco.editor.ITextModel) => lintJS(model, 'ts-lint')

// ─── Java ─────────────────────────────────────────────────────────────────────

export function lintJava(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')
  const source = 'java-lint'

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return

    // ── Missing semicolon (heuristic) ─────────────────────────────────────
    // Statements that don't end with ; { } or are continuations.
    if (
      /^\s+\S/.test(raw) && // inside a block
      !/[;{}(,\\]$/.test(trimmed) &&
      !/^\s*(\/\/|\/\*|\*)/.test(raw) &&
      !/\b(if|else|for|while|do|try|catch|finally|switch|class|interface|enum|@)\b/.test(trimmed) &&
      !/^@/.test(trimmed)
    ) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, trimmed.length, 1, 'Possible missing semicolon', source))
    }

    // ── System.out.println ────────────────────────────────────────────────
    if (/System\.out\.(println|print)\s*\(/.test(raw)) {
      const col = raw.indexOf('System') + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 6, 'Debug print — use a logger instead', source))
    }

    // ── String comparison with == ─────────────────────────────────────────
    if (/"\s*==\s*"/.test(raw) || /\bString\b.*==/.test(raw)) {
      const col = raw.search(/==/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 2, 'Use .equals() to compare Strings, not ==', source))
    }

    // ── Catching generic Exception / Throwable ────────────────────────────
    if (/catch\s*\(\s*(Exception|Throwable)\s+/.test(raw)) {
      const col = raw.search(/catch/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 5, 'Avoid catching generic Exception/Throwable — catch specific exceptions', source))
    }

    // ── Empty catch block ─────────────────────────────────────────────────
    if (/catch\s*\(.+\)\s*\{\s*\}/.test(raw)) {
      const col = raw.search(/catch/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 5, 'Empty catch block silently swallows exceptions', source))
    }

    // ── Braces-less control flow ──────────────────────────────────────────
    if (/^\s*(if|else if|else|for|while)\s*(\(.*\))?\s*[^{{\n].*\S/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, 1, trimmed.length, 'Consider braces even for single-line control flow', source))
    }

    // ── Trailing whitespace ───────────────────────────────────────────────
    if (/\s+$/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, raw.search(/\s+$/) + 1, 1, 'Trailing whitespace', source))
    }
  })

  return [...markers, ...lintBrackets(model, source)]
}

// ─── Kotlin ───────────────────────────────────────────────────────────────────

export function lintKotlin(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')
  const source = 'kotlin-lint'

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return

    // ── Non-null assertion !! ─────────────────────────────────────────────
    const nnIdx = raw.indexOf('!!')
    if (nnIdx !== -1) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, nnIdx + 1, 2, "Non-null assertion '!!' — handle nullability explicitly", source))
    }

    // ── Mutable var that could be val ─────────────────────────────────────
    // Can only flag vars that are only assigned once in the file; simplified: flag vars with no reassignment.
    // (Full data-flow would require a real AST — flag all `var` and let devs decide.)
    if (/^\s*var\s+/.test(raw)) {
      const col = raw.search(/\bvar\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 3, "Consider 'val' if this variable is not reassigned", source))
    }

    // ── Empty when branch ─────────────────────────────────────────────────
    if (/\bwhen\s*\(/.test(raw) && raw.includes('->') && /\{\s*\}/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, 1, trimmed.length, 'Empty when branch', source))
    }

    // ── String concatenation with + (prefer templates) ────────────────────
    if (/"\s*\+\s*("|[a-zA-Z_])/.test(raw)) {
      const col = raw.search(/"\s*\+/) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 1, "Prefer string templates (\${...}) over concatenation", source))
    }

    // ── Trailing whitespace ───────────────────────────────────────────────
    if (/\s+$/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, raw.search(/\s+$/) + 1, 1, 'Trailing whitespace', source))
    }
  })

  return [...markers, ...lintBrackets(model, source)]
}

// ─── Rust ─────────────────────────────────────────────────────────────────────

export function lintRust(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')
  const source = 'rust-lint'

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('//')) return

    // ── unwrap() ─────────────────────────────────────────────────────────
    if (/\.unwrap\s*\(\s*\)/.test(raw)) {
      const col = raw.search(/\.unwrap/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 7, ".unwrap() will panic on None/Err — use '?' or handle explicitly", source))
    }

    // ── expect() — slightly better but still can panic ────────────────────
    if (/\.expect\s*\(/.test(raw)) {
      const col = raw.search(/\.expect/) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 7, ".expect() will panic — ensure this cannot fail in production", source))
    }

    // ── clone() overuse ───────────────────────────────────────────────────
    if (/\.clone\s*\(\s*\)/.test(raw)) {
      const col = raw.search(/\.clone/) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 6, 'Explicit .clone() — ensure cloning is necessary', source))
    }

    // ── println! in non-main ──────────────────────────────────────────────
    if (/\bprintln!\s*\(/.test(raw)) {
      const col = raw.search(/\bprintln!/) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 8, 'Debug println! — consider using the log crate', source))
    }

    // ── todo!() / unimplemented!() ────────────────────────────────────────
    const todoMatch = raw.match(/\b(todo|unimplemented|panic)!\s*\(/)
    if (todoMatch) {
      const col = raw.search(/\b(todo|unimplemented|panic)!/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, todoMatch[1].length + 1, `${todoMatch[1]}!() will panic at runtime`, source))
    }

    // ── Trailing whitespace ───────────────────────────────────────────────
    if (/\s+$/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, raw.search(/\s+$/) + 1, 1, 'Trailing whitespace', source))
    }
  })

  return [...markers, ...lintBrackets(model, source)]
}

// ─── Go ───────────────────────────────────────────────────────────────────────

export function lintGo(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')
  const source = 'go-lint'

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('//')) return

    // ── Ignored error ─────────────────────────────────────────────────────
    // Pattern: _, err or just _ on the left of :=
    if (/,\s*_\s*:=/.test(raw) && /err/i.test(raw)) {
      const col = raw.search(/,\s*_/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 2, 'Ignoring returned error — handle or explicitly discard with reason', source))
    }

    // ── panic() ───────────────────────────────────────────────────────────
    if (/\bpanic\s*\(/.test(raw)) {
      const col = raw.search(/\bpanic\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 5, 'panic() terminates the program — use error returns instead', source))
    }

    // ── fmt.Println ───────────────────────────────────────────────────────
    if (/\bfmt\.(Println|Printf|Print)\s*\(/.test(raw)) {
      const col = raw.search(/\bfmt\./) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 3, 'Debug fmt print — consider using log or slog', source))
    }

    // ── Exported function without comment ─────────────────────────────────
    if (/^func [A-Z]/.test(trimmed)) {
      const prev = lines[i - 1]?.trim() ?? ''
      if (!prev.startsWith('//')) {
        const col = raw.search(/\bfunc\b/) + 1
        markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 4, 'Exported function missing godoc comment', source))
      }
    }

    // ── Trailing whitespace ───────────────────────────────────────────────
    if (/\s+$/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, raw.search(/\s+$/) + 1, 1, 'Trailing whitespace', source))
    }
  })

  return [...markers, ...lintBrackets(model, source)]
}

// ─── C / C++ ──────────────────────────────────────────────────────────────────

export function lintC(model: monaco.editor.ITextModel, source = 'c-lint'): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return

    // ── gets() ────────────────────────────────────────────────────────────
    if (/\bgets\s*\(/.test(raw)) {
      const col = raw.search(/\bgets\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Error, lineNo, col, 4, "'gets' is unsafe and removed in C11 — use fgets()", source))
    }

    // ── strcpy / strcat without bounds ────────────────────────────────────
    if (/\b(strcpy|strcat)\s*\(/.test(raw)) {
      const m = raw.match(/\b(strcpy|strcat)/)!
      const col = raw.search(/\b(strcpy|strcat)\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, m[0].length, `'${m[0]}' is unsafe — use ${m[0]}n() with explicit bounds`, source))
    }

    // ── sprintf without bounds ────────────────────────────────────────────
    if (/\bsprintf\s*\(/.test(raw)) {
      const col = raw.search(/\bsprintf\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 7, "'sprintf' is unsafe — use snprintf()", source))
    }

    // ── malloc without cast / without null check (heuristic) ─────────────
    if (/\bmalloc\s*\(/.test(raw) && !raw.includes('NULL') && !raw.includes('nullptr')) {
      const col = raw.search(/\bmalloc\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, col, 6, 'Check malloc() return value for NULL before use', source))
    }

    // ── printf without format string literal ─────────────────────────────
    if (/\bprintf\s*\(\s*[^"]/.test(raw)) {
      const col = raw.search(/\bprintf\b/) + 1
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, col, 6, 'Possible format string vulnerability — use printf("%s", var)', source))
    }

    // ── Missing semicolon (heuristic — not after { } preprocessor or comment) ──
    if (
      /^\s+\S/.test(raw) &&
      !/[;{}\\,]$/.test(trimmed) &&
      !/^\s*(\/\/|\/\*|\*|#)/.test(raw) &&
      !/\b(if|else|for|while|do|switch|struct|union|enum|typedef)\b/.test(trimmed)
    ) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, raw.trimEnd().length, 1, 'Possible missing semicolon', source))
    }

    // ── Trailing whitespace ───────────────────────────────────────────────
    if (/\s+$/.test(raw)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, raw.search(/\s+$/) + 1, 1, 'Trailing whitespace', source))
    }
  })

  return [...markers, ...lintBrackets(model, source)]
}

export const lintCpp = (model: monaco.editor.ITextModel) => lintC(model, 'cpp-lint')

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function lintStandardLanguage(
  monacoApi: typeof monaco,
  model: monaco.editor.ITextModel,
): void {
  const lang = model.getLanguageId()
  let markers: monaco.editor.IMarkerData[] = []

  switch (lang) {
    case 'json':       markers = lintJson(model);           break
    case 'javascript': markers = lintJavaScript(model);     break
    case 'typescript': markers = lintTypeScript(model);     break
    case 'python':     markers = lintPython(model);         break
    case 'java':       markers = lintJava(model);           break
    case 'kotlin':     markers = lintKotlin(model);         break
    case 'rust':       markers = lintRust(model);           break
    case 'go':         markers = lintGo(model);             break
    case 'c':          markers = lintC(model);              break
    case 'cpp':        markers = lintCpp(model);            break
    default:           break
  }

  monacoApi.editor.setModelMarkers(model, `${lang}-lint`, markers)
}