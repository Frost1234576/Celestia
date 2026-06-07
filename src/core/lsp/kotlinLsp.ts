import * as monaco from 'monaco-editor'
import { MonacoLanguageClient } from 'monaco-languageclient'
import { WebSocketMessageReader, WebSocketMessageWriter, toSocket } from 'vscode-ws-jsonrpc'
import { CloseAction, ErrorAction } from 'vscode-languageclient'

let client: MonacoLanguageClient | null = null

export async function startKotlinLsp(projectPath: string): Promise<void> {
  if (client) {
    console.log('[Kotlin LSP] Client already running')
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket('ws://localhost:8918')
      const timeout = setTimeout(() => {
        ws.close()
        const err = new Error('WebSocket connection timeout - is LSP bridge running?')
        console.error('[Kotlin LSP]', err.message)
        reject(err)
      }, 5000)

      ws.onopen = () => {
        clearTimeout(timeout)
        console.log('[Kotlin LSP] WebSocket connected')
        try {
          const socket = toSocket(ws)
          const reader = new WebSocketMessageReader(socket)
          const writer = new WebSocketMessageWriter(socket)

          client = new MonacoLanguageClient({
            name: 'Kotlin Language Client',
            clientOptions: {
              documentSelector: [{ language: 'kotlin' }],
              workspaceFolder: {
                uri: monaco.Uri.file(projectPath),
                name: projectPath.split(/[\\/]/).pop() ?? 'project',
                index: 0,
              },
              errorHandler: {
                error: (error, message, count) => {
                  console.error(`[Kotlin LSP] Error #${count}:`, error, message)
                  return { action: ErrorAction.Continue }
                },
                closed: () => {
                  console.warn('[Kotlin LSP] Connection closed')
                  return { action: CloseAction.DoNotRestart }
                },
              },
              diagnosticCollectionName: 'kotlin',
            },
            messageTransports: { reader, writer },
          })

          client.start()
          console.log('[Kotlin LSP] ✓ Client started successfully for', projectPath)
          resolve()
        } catch (err) {
          console.error('[Kotlin LSP] Failed to initialize client:', err)
          reject(err)
        }
      }

      ws.onerror = (event) => {
        clearTimeout(timeout)
        const err = new Error(`WebSocket error: ${event}`)
        console.error('[Kotlin LSP]', err.message)
        reject(err)
      }

      ws.onclose = () => {
        clearTimeout(timeout)
        console.log('[Kotlin LSP] WebSocket closed')
        client = null
      }
    } catch (err) {
      console.error('[Kotlin LSP] Exception:', err)
      reject(err)
    }
  })
}

export async function stopKotlinLsp(): Promise<void> {
  if (client) {
    try {
      await client.stop()
      console.log('[Kotlin LSP] ✓ Client stopped')
    } catch (err) {
      console.error('[Kotlin LSP] Error stopping client:', err)
    } finally {
      client = null
    }
  }
}

export function isKotlinLspRunning(): boolean {
  return client !== null
}

