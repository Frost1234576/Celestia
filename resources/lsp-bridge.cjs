const { WebSocketServer } = require('ws')
const { spawn } = require('child_process')
const { resolve } = require('path')

// Try to find kotlin-language-server in multiple locations
const fs = require('fs')
const possiblePaths = [
  resolve(__dirname, 'kotlin-language-server', 'bin', 'kotlin-language-server.bat'),
  'C:\\Users\\Joshu\\Downloads\\kotlin-server-262.4739.0.win\\kotlin-lsp.cmd',
  'kotlin-lsp.cmd',
  'kotlin-language-server',
]

let LSP_PATH = 'kotlin-lsp.cmd' // default fallback

for (const p of possiblePaths) {
  try {
    if (fs.existsSync(p)) {
      LSP_PATH = p
      break
    }
  } catch {
    // Continue to next path
  }
}

console.log(`[LSP Bridge] Using Kotlin LS at: ${LSP_PATH}`)

const wss = new WebSocketServer({ port: 8918 })
let connectionCount = 0

wss.on('connection', ws => {
  const connId = ++connectionCount
  console.log(`[LSP Bridge] Client #${connId} connected`)

  try {
    const proc = spawn(LSP_PATH, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: true,
    })

    proc.stdout.on('data', d => {
      if (ws.readyState === 1) {
        ws.send(d)
      }
    })

    ws.on('message', msg => {
      proc.stdin.write(msg)
    })

    ws.on('close', () => {
      console.log(`[LSP Bridge] Client #${connId} disconnected`)
      proc.kill()
    })

    proc.on('error', err => {
      console.error(`[LSP Bridge] Process error:`, err)
      ws.close(1011, 'LSP process error')
    })

    proc.on('exit', code => {
      console.log(`[LSP Bridge] LSP process exited with code ${code}`)
      ws.close()
    })
  } catch (err) {
    console.error(`[LSP Bridge] Failed to spawn process:`, err)
    ws.close(1011, 'Failed to spawn LSP process')
  }
})

wss.on('error', err => {
  console.error(`[LSP Bridge] WebSocket error:`, err)
})

console.log('[LSP Bridge] Listening on ws://localhost:8918')
