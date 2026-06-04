import * as monaco from 'monaco-editor'

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

export function lintJson(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const text = model.getValue()
  if (!text.trim()) return []
  try {
    JSON.parse(text)
    return []
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON'
    return [marker(monaco.MarkerSeverity.Error, 1, 1, 1, message, 'json-lint')]
  }
}

export function lintBrackets(model: monaco.editor.ITextModel, source: string): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const stack: { char: string; line: number; col: number }[] = []
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const lines = model.getValue().split('\n')

  lines.forEach((line, lineIndex) => {
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      if (ch === '(' || ch === '[' || ch === '{') {
        stack.push({ char: ch, line: lineIndex + 1, col: col + 1 })
      } else if (ch in pairs) {
        const last = stack.pop()
        if (!last || last.char !== pairs[ch]) {
          markers.push(marker(monaco.MarkerSeverity.Error, lineIndex + 1, col + 1, 1, `Unexpected '${ch}'`, source))
        }
      }
    }
  })

  for (const unclosed of stack) {
    markers.push(marker(monaco.MarkerSeverity.Error, unclosed.line, unclosed.col, 1, `Unclosed '${unclosed.char}'`, source))
  }
  return markers
}

/** Example Python linter — indentation + common issues */
export function lintPython(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')

  lines.forEach((line, i) => {
    const lineNo = i + 1
    if (/\t/.test(line)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, 1, 1, 'Use spaces instead of tabs (PEP 8)', 'python-lint'))
    }
    if (/^\s*(if|elif|for|while|def|class)\s+.+[^:]\s*$/.test(line)) {
      const idx = line.search(/(if|elif|for|while|def|class)/)
      markers.push(marker(monaco.MarkerSeverity.Error, lineNo, idx + 1, 3, 'Missing colon at end of block', 'python-lint'))
    }
    if (/^\s{1,3}\S/.test(line) && line.trim()) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, 1, 4, 'Indentation should be multiples of 4 spaces', 'python-lint'))
    }
  })

  return [...markers, ...lintBrackets(model, 'python-lint')]
}

/** Example Java linter */
export function lintJava(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const text = model.getValue()
  const lines = text.split('\n')

  if (text.includes('class ') && !text.includes('public class') && !text.includes('class ')) {
    // skip
  }
  if (/class\s+\w+/.test(text) && !text.includes('{')) {
    markers.push(marker(monaco.MarkerSeverity.Error, 1, 1, 5, 'Class body missing opening brace', 'java-lint'))
  }

  lines.forEach((line, i) => {
    const lineNo = i + 1
    if (/^\s*(if|for|while|else)\s*\(.+\)\s*[^{]\s*$/.test(line)) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, 1, 2, 'Consider braces for control flow', 'java-lint'))
    }
    if (/System\.out\.println/.test(line)) {
      const idx = line.indexOf('System')
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, idx + 1, 6, 'Debug print statement', 'java-lint'))
    }
  })

  return [...markers, ...lintBrackets(model, 'java-lint')]
}

/** Example Kotlin linter */
export function lintKotlin(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getValue().split('\n')

  lines.forEach((line, i) => {
    const lineNo = i + 1
    if (/fun\s+\w+/.test(line) && !line.includes('{') && !line.includes('=')) {
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, 1, 3, 'Function may need a body', 'kotlin-lint'))
    }
    if (/!!/.test(line)) {
      const idx = line.indexOf('!!')
      markers.push(marker(monaco.MarkerSeverity.Warning, lineNo, idx + 1, 2, 'Avoid non-null assertion (!!)', 'kotlin-lint'))
    }
    if (/println\(/.test(line)) {
      const idx = line.indexOf('println')
      markers.push(marker(monaco.MarkerSeverity.Info, lineNo, idx + 1, 7, 'Debug print statement', 'kotlin-lint'))
    }
  })

  return [...markers, ...lintBrackets(model, 'kotlin-lint')]
}

export function lintStandardLanguage(
  monacoApi: typeof monaco,
  model: monaco.editor.ITextModel,
): void {
  const lang = model.getLanguageId()
  let markers: monaco.editor.IMarkerData[] = []

  switch (lang) {
    case 'json': markers = lintJson(model); break
    case 'typescript':
    case 'javascript': markers = lintBrackets(model, `${lang}-lint`); break
    case 'python': markers = lintPython(model); break
    case 'java': markers = lintJava(model); break
    case 'kotlin': markers = lintKotlin(model); break
    default: break
  }

  monacoApi.editor.setModelMarkers(model, `${lang}-lint`, markers)
}
