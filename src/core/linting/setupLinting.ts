import type * as monaco from 'monaco-editor'
import { registerStellaLanguage, defineStellaTheme, STELLA_LANGUAGE_ID } from './stellaLanguage'
import { applyStellaLint } from './stellaLinter'
import { lintStandardLanguage } from './standardLinters'

let initialized = false
const lintTimers = new WeakMap<monaco.editor.ITextModel, ReturnType<typeof setTimeout>>()

function scheduleLint(monacoApi: typeof monaco, model: monaco.editor.ITextModel): void {
  const existing = lintTimers.get(model)
  if (existing) clearTimeout(existing)

  lintTimers.set(model, setTimeout(() => {
    lintModel(monacoApi, model)
  }, 300))
}

function lintModel(monacoApi: typeof monaco, model: monaco.editor.ITextModel): void {
  const lang = model.getLanguageId()

  if (lang === STELLA_LANGUAGE_ID) {
    applyStellaLint(monacoApi, model)
  } else {
    lintStandardLanguage(monacoApi, model)
  }
}

/** Register languages, theme, and lint providers. Safe to call once. */
export function setupLinting(monacoApi: typeof monaco): void {
  if (initialized) return
  initialized = true

  registerStellaLanguage(monacoApi)
  defineStellaTheme(monacoApi)
  monacoApi.editor.setTheme('celestia-dark')

  monacoApi.editor.onDidCreateModel(model => {
    lintModel(monacoApi, model)
    model.onDidChangeContent(() => scheduleLint(monacoApi, model))
  })

  // Lint models that already exist (e.g. hot reload)
  monacoApi.editor.getModels().forEach(model => {
    lintModel(monacoApi, model)
    model.onDidChangeContent(() => scheduleLint(monacoApi, model))
  })
}
