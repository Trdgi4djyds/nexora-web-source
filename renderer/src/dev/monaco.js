/* Chargement de l'éditeur Monaco (celui de Visual Studio Code), en français, avec les thèmes de NEXORA. */
import { isDark } from '../core/theme.js';

let loading = null;

function script(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Chargement impossible : ${src}`));
    document.head.append(s);
  });
}

export function loadMonaco() {
  if (loading) return loading;
  loading = (async () => {
    // Le chargeur AMD de Monaco définit window.require et window.define : on les isole aussitôt.
    const prevRequire = window.require;
    const prevDefine = window.define;
    await script('vendor/monaco/vs/loader.js');
    const amdRequire = window.require;
    window.require = prevRequire;
    const amdDefine = window.define;
    window.define = prevDefine;
    window.__vtAmd = { require: amdRequire, define: amdDefine };
    amdRequire.config({ paths: { vs: 'vendor/monaco/vs' } });
    window.MonacoEnvironment = {
      getWorkerUrl: () => {
        const base = new URL('vendor/monaco/', document.baseURI).href;
        const src = `self.MonacoEnvironment = { baseUrl: '${base}' }; importScripts('${base}vs/base/worker/workerMain.js');`;
        return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      },
    };
    const monaco = await new Promise((resolve, reject) => {
      // define reste global : Monaco charge à la demande les langages (HTML, CSS, TypeScript…) en AMD.
      window.define = amdDefine;
      amdRequire(['vs/nls.messages.fr'], () => {
        amdRequire(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
      }, () => amdRequire(['vs/editor/editor.main'], () => resolve(window.monaco), reject));
    });
    setup(monaco);
    return monaco;
  })();
  return loading;
}

function setup(monaco) {
  monaco.editor.defineTheme('vitrine-light', {
    base: 'vs', inherit: true, rules: [], colors: { 'editor.background': '#ffffff', 'editorLineNumber.foreground': '#b0b0b8', 'editor.lineHighlightBackground': '#f5f5f7', 'editorGutter.background': '#ffffff' },
  });
  monaco.editor.defineTheme('vitrine-dark', {
    base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#1e1e21', 'editorLineNumber.foreground': '#5c5c64', 'editor.lineHighlightBackground': '#26262a', 'editorGutter.background': '#1e1e21' },
  });
  const ts = monaco.languages.typescript;
  const opts = {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs, jsx: ts.JsxEmit.Preserve, allowJs: true, allowNonTsExtensions: true, esModuleInterop: true, skipLibCheck: true,
  };
  ts.typescriptDefaults.setCompilerOptions(opts);
  ts.javascriptDefaults.setCompilerOptions(opts);
  // Sans les dépendances du projet, l'analyse des types signalerait de fausses erreurs d'import :
  // on garde la vérification de la syntaxe.
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  ts.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  ts.typescriptDefaults.setEagerModelSync(true);
}

export const monacoTheme = () => (isDark() ? 'vitrine-dark' : 'vitrine-light');
