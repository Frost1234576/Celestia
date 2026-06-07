import * as monaco from 'monaco-editor'
import { STELLA_LANGUAGE_ID } from './stellaLanguage'

/**
 * Example custom linter for Stella (.st) files.
 *
 * Replace these rules with your real Stella compiler diagnostics.
 * Hook into your compiler API and map errors to IMarkerData objects.
 */
export function lintStella(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    // Example: warn on TODO comments
    const todoIdx = line.indexOf('TODO')
    if (todoIdx >= 0) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: 'TODO: resolve before shipping',
        startLineNumber: lineNumber,
        startColumn: todoIdx + 1,
        endLineNumber: lineNumber,
        endColumn: todoIdx + 5,
        source: 'stella-lint',
      })
    }

    // Example: require fn keyword for function declarations
    const fnDecl = line.match(/^\s*([a-zA-Z_]\w*)\s*\([^)]*\)\s*[=:>]/)
    if (fnDecl && !line.includes('fn ')) {
      const nameStart = line.indexOf(fnDecl[1]) + 1
      markers.push({
        severity: monaco.MarkerSeverity.Info,
        message: 'Consider prefixing function declarations with `fn`',
        startLineNumber: lineNumber,
        startColumn: nameStart,
        endLineNumber: lineNumber,
        endColumn: nameStart + fnDecl[1].length,
        source: 'stella-lint',
      })
    }

    // Example: unbalanced parentheses on a single line
    const opens = (line.match(/[([]/g) ?? []).length
    const closes = (line.match(/[)\]]/g) ?? []).length
    if (opens !== closes && line.trim().length > 0) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: 'Unbalanced brackets on this line',
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: line.length + 1,
        source: 'stella-lint',
      })
    }
  })

  return markers
}

export function applyStellaLint(
  monacoApi: typeof monaco,
  model: monaco.editor.ITextModel,
): void {
  if (model.getLanguageId() !== STELLA_LANGUAGE_ID) return
  const markers = lintStella(model)
  monacoApi.editor.setModelMarkers(model, STELLA_LANGUAGE_ID, markers)
}
