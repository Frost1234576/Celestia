"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("celestia", {
  rich_presence: {
    set: (details, state, projectName, smallImageKey) => electron.ipcRenderer.send("rich-presence:set", { details, state, projectName, smallImageKey }),
    clear: () => electron.ipcRenderer.send("rich-presence:clear")
  },
  window: {
    minimize: () => electron.ipcRenderer.send("window:minimize"),
    maximize: () => electron.ipcRenderer.send("window:maximize"),
    close: () => electron.ipcRenderer.send("window:close"),
    isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
    onMaximizeChange: (cb) => {
      electron.ipcRenderer.on("window:maximized", () => cb(true));
      electron.ipcRenderer.on("window:unmaximized", () => cb(false));
    }
  },
  dialog: {
    openFolder: () => electron.ipcRenderer.invoke("dialog:openFolder"),
    openFile: () => electron.ipcRenderer.invoke("dialog:openFile")
  },
  fs: {
    readDir: (p) => electron.ipcRenderer.invoke("fs:readDir", p),
    readArchiveTree: (p) => electron.ipcRenderer.invoke("fs:readArchiveTree", p),
    readFile: (p) => electron.ipcRenderer.invoke("fs:readFile", p),
    writeFile: (p, content) => electron.ipcRenderer.invoke("fs:writeFile", p, content),
    createFile: (p) => electron.ipcRenderer.invoke("fs:createFile", p),
    createDir: (p) => electron.ipcRenderer.invoke("fs:createDir", p),
    rename: (oldP, newP) => electron.ipcRenderer.invoke("fs:rename", oldP, newP),
    delete: (p) => electron.ipcRenderer.invoke("fs:delete", p),
    exists: (p) => electron.ipcRenderer.invoke("fs:exists", p)
  },
  shell: {
    showItemInFolder: (p) => electron.ipcRenderer.invoke("shell:showItemInFolder", p)
  },
  terminal: {
    create: (id, cwd) => electron.ipcRenderer.invoke("terminal:create", id, cwd),
    write: (id, data) => electron.ipcRenderer.send("terminal:write", id, data),
    resize: (id, cols, rows) => electron.ipcRenderer.send("terminal:resize", id, cols, rows),
    kill: (id) => electron.ipcRenderer.send("terminal:kill", id),
    onData: (id, cb) => {
      const channel = `terminal:data:${id}`;
      const handler = (_, data) => cb(data);
      electron.ipcRenderer.on(channel, handler);
      return () => electron.ipcRenderer.off(channel, handler);
    },
    onExit: (id, cb) => {
      electron.ipcRenderer.once(`terminal:exit:${id}`, cb);
    }
  },
  ollama: {
    chat: (payload) => electron.ipcRenderer.invoke("ollama:chat", payload),
    listModels: () => electron.ipcRenderer.invoke("ollama:listModels")
  },
  agent: {
    run: (payload) => electron.ipcRenderer.invoke("agent:run", payload)
  },
  stella: {
    compile: (filePath, outputDir) => electron.ipcRenderer.invoke("stella:compile", filePath, outputDir)
  }
});
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on: (...args) => electron.ipcRenderer.on(...args),
  off: (...args) => electron.ipcRenderer.off(...args),
  send: (...args) => electron.ipcRenderer.send(...args),
  invoke: (...args) => electron.ipcRenderer.invoke(...args)
});
electron.contextBridge.exposeInMainWorld("electron", {
  onSaveFile: (cb) => electron.ipcRenderer.on("save-file", cb),
  offSaveFile: () => electron.ipcRenderer.removeAllListeners("save-file")
});
