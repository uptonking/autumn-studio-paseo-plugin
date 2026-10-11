// Compiles this plugin with the real daemon compiler, the same esbuild
// pipeline the daemon runs at start. Catches boundary/bundling errors that
// tsc cannot see (node builtins in client bundles, unresolved imports).
//
// Run from the plugin directory:  node scripts/compile-check.mjs
// Writes bundle sizes on success; exits non-zero with the compiler's error.
import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The plugin lives in <paseo-checkout>/../paseo-plugins/<name> or .../<name>/plugin.
const candidates = [
  resolve(pluginDir, "../../paseo/packages/server/dist/server/server/plugins/compiler.js"),
  resolve(pluginDir, "../../paseo/packages/server/dist/server/plugins/compiler.js"),
  resolve(pluginDir, "../../../paseo/packages/server/dist/server/server/plugins/compiler.js"),
  resolve(pluginDir, "../../../paseo/packages/server/dist/server/plugins/compiler.js"),
];
if (process.env.PASEO_COMPILER) candidates.unshift(process.env.PASEO_COMPILER);
const compilerPath = candidates.find((p) => existsSync(p));
if (!compilerPath) {
  console.error(
    `Could not locate the paseo daemon compiler.\n` +
      `Set PASEO_COMPILER to packages/server/dist/server/server/plugins/compiler.js\n` +
      `inside a paseo checkout, then re-run.`
  );
  process.exit(1);
}

const { compilePlugin } = await import(compilerPath);

const result = await compilePlugin({
  client: join(pluginDir, "index.client.tsx"),
  server: join(pluginDir, "index.server.ts"),
});

if (result.clientBundle) {
  writeFileSync("/tmp/fe-client-bundle.js", result.clientBundle);
  console.log(`client bundle: ${(result.clientBundle.length / 1024 / 1024).toFixed(2)} MB`);
} else {
  console.log("client bundle: NONE");
}
if (result.serverBundle) {
  writeFileSync("/tmp/fe-server-bundle.js", result.serverBundle);
  console.log(`server bundle: ${(result.serverBundle.length / 1024).toFixed(1)} KB`);
} else {
  console.log("server bundle: NONE");
}
console.log("COMPILE OK");
