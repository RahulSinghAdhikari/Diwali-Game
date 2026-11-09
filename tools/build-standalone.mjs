/**
 * Builds a single self-contained HTML file you can open by double-clicking —
 * no server, no network, no preview panel required.
 *
 *   node tools/build-standalone.mjs   ->  play-offline.html
 *
 * Every stylesheet and the whole ES module graph are inlined, so the page has
 * zero external requests (apart from the optional Google Fonts link, which is
 * dropped: the font stack falls back to system faces offline).
 */

import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'play-offline.html');

const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');

function escapeForScript(code) {
  // Stop a literal </script> inside a string from closing the tag early.
  return code.replace(/<\/script>/gi, '<\\/script>');
}

const html = await read('index.html');

// 1. Inline every stylesheet, in document order.
const cssLinks = [...html.matchAll(/<link[^>]+href="(css\/[^"]+)"[^>]*>/g)];
let css = '';
for (const [, href] of cssLinks) css += `/* ${href} */\n${await read(href)}\n`;

// 2. Bundle the module graph into one classic script.
const bundle = await build({
  entryPoints: [path.join(ROOT, 'js/app.js')],
  bundle: true,
  // IIFE + a classic <script> tag, NOT a module. Browsers treat a file://
  // document as an opaque origin, and module semantics there are inconsistent
  // across browsers; a classic script always runs. The DOM-ready wrapper added
  // below restores the deferred timing that `type="module"` gave us.
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning'
});
const js = bundle.outputFiles[0].text;

// 3. Stitch it together.
//
// NOTE: every replacement below passes a FUNCTION, never a string. In a string
// replacement JavaScript expands `$$` to `$`, `$&` to the match and so on —
// which silently rewrote `$$` (the querySelectorAll helper) to `$` and broke
// the bundle. A function replacer disables that substitution entirely.
const sub = (haystack, pattern, replacement) => haystack.replace(pattern, () => replacement);

let out = html;
cssLinks.forEach(([tag], i) => {
  out = sub(out, tag, i === 0 ? `<style>\n${css}</style>` : '');
});

// Fonts need the network; offline we fall back to the system stack.
out = out.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, () => '');

const wrapped =
  `(function () {\n` +
  `  function boot() {\n${escapeForScript(js)}\n  }\n` +
  `  if (document.readyState === 'loading') {\n` +
  `    document.addEventListener('DOMContentLoaded', boot);\n` +
  `  } else { boot(); }\n` +
  `})();`;

out = sub(
  out,
  /<script type="module" src="js\/app\.js"><\/script>/,
  `<script>\n${wrapped}\n</script>`
);

if (/<link[^>]+href="css\//.test(out)) throw new Error('a stylesheet was left external');
if (out.includes('src="js/')) throw new Error('a script was left external');

// The inlined bundle must survive the stitching byte for byte.
if (!out.includes(escapeForScript(js))) throw new Error('the bundle was altered while inlining');
if (!/var \$\$ = \(sel, root = document\)/.test(out)) {
  throw new Error('the $$ helper was corrupted — check for string-replacement $-expansion');
}
if (/<script[^>]*type="module"/.test(out)) throw new Error('offline build must not use a module script');

await fs.writeFile(OUT, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
console.log(`play-offline.html  ${kb} KB  (${cssLinks.length} stylesheets + ${(js.length / 1024).toFixed(0)} KB of JS inlined)`);
