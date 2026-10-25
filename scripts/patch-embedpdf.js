// Paseo's plugin compiler rejects any static node-module import in client
// bundles. @embedpdf/models keeps a `require("crypto")` fallback for runtimes
// without WebCrypto — unreachable in Electron/Chromium, but the compiler
// refuses the bundle anyway. Replace the fallback with a throw; the primary
// globalThis.crypto path is untouched.
import { readFileSync, writeFileSync } from 'fs';

const target = 'node_modules/@embedpdf/models/dist/index.js';
let source = readFileSync(target, 'utf-8');

const needle = `const { randomBytes } = require("crypto");
      return randomBytes(len);`;
const replacement = `throw new Error("WebCrypto unavailable");
      /* eslint no-unreachable: off */`;

if (source.includes(needle)) {
  source = source.replace(needle, replacement);
  writeFileSync(target, source);
  console.log('✓ patched @embedpdf/models: removed node crypto fallback');
} else if (source.includes(replacement)) {
  console.log('✓ @embedpdf/models already patched');
} else {
  console.error('⚠ @embedpdf/models patch target not found — crypto fallback may have moved');
  process.exitCode = 1;
}
