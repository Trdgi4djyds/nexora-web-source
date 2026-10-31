// Construction de la version web de NEXORA : regroupe l'interface (renderer/src) avec le pont navigateur,
// copie les ressources et produit un site statique dans web/dist (à héberger n'importe où).
// Variables : NEXORA_SUPABASE_URL et NEXORA_SUPABASE_ANON (sinon, projet NEXORA par défaut).
import { build } from 'esbuild';
import { rmSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, 'renderer/src/web/boot.js')],
  outdir: path.join(out, 'assets'),
  bundle: true,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  target: 'chrome120',
  minify: !process.argv.includes('--dev'),
  sourcemap: process.argv.includes('--dev') ? 'inline' : false,
  legalComments: 'external',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': '"production"',
    __NX_SUPABASE_URL__: JSON.stringify(process.env.NEXORA_SUPABASE_URL || ''),
    __NX_SUPABASE_ANON__: JSON.stringify(process.env.NEXORA_SUPABASE_ANON || ''),
  },
});

// Pont navigateur, chargé avant tout le reste (script classique).
await build({
  stdin: { contents: "import './shim.js'; import './webview.js';", resolveDir: path.join(root, 'renderer/src/web'), loader: 'js' },
  outfile: path.join(out, 'assets/pre.js'), bundle: true, format: 'iife', target: 'chrome120', minify: true,
});

const copy = (from, to = from) => { const src = path.join(root, 'renderer', from); if (existsSync(src)) cpSync(src, path.join(out, to), { recursive: true }); };
cpSync(path.join(here, 'index.html'), path.join(out, 'index.html'));
copy('styles.css');
copy('fonts');
copy('logo.png');
copy('logo.svg');
copy('audit.js');
cpSync(path.join(out, 'index.html'), path.join(out, '404.html'));
console.log('Version web prête dans web/dist');
