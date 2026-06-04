import type * as monaco from 'monaco-editor'

/**
 * Example Stella language definition for Monaco.
 * Replace tokenizer rules and keywords with your real Stella grammar.
 */
export const STELLA_LANGUAGE_ID = 'stella'

export function registerStellaLanguage(monacoApi: typeof monaco): void {
  monacoApi.languages.register({ id: STELLA_LANGUAGE_ID })

  monacoApi.languages.setMonarchTokensProvider(STELLA_LANGUAGE_ID, {
    keywords: [
      'fn', 'let', 'in', 'if', 'then', 'else', 'match', 'case',
      'type', 'import', 'export', 'module', 'struct', 'enum',
      'return', 'true', 'false', 'null', 'async', 'await',
    ],
    typeKeywords: ['Int', 'String', 'Bool', 'Unit', 'List', 'Option'],
    operators: ['=', '->', '=>', '+', '-', '*', '/', '==', '!=', '<', '>', '<=', '>='],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@default': 'identifier',
          },
        }],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
        [/\d+\.\d+/, 'number.float'],
        [/\d+/, 'number'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/[{}()[\]]/, '@brackets'],
        [/@symbols/, 'operator'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  })

  monacoApi.languages.setLanguageConfiguration(STELLA_LANGUAGE_ID, {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'], ['[', ']'], ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  })
}

export function defineStellaTheme(monacoApi: typeof monaco): void {
  monacoApi.editor.defineTheme('celestia-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'BF7E96', fontStyle: 'bold' },
      { token: 'keyword.control', foreground: 'C586C0' },
      { token: 'type', foreground: '98b7d6' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'string', foreground: '89d185' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'operator', foreground: 'd4d4d4' },
      { token: 'delimiter', foreground: 'D4D4D4' },
      { token: 'annotation', foreground: 'DCDCAA' },
      { token: 'metatag', foreground: '569CD6' },
    ],
    colors: {
      'editor.background': '#1a1a1a',
      'editor.lineHighlightBackground': '#252525',
      'editorCursor.foreground': '#98b7d6',
      'editor.selectionBackground': '#1e3a5288',
    },
  })
}
