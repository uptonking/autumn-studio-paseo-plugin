// Compiles this plugin with the real daemon compiler, the same esbuild
// pipeline the daemon runs at start. Catches boundary/bundling errors that
// tsc cannot see (node builtins in client bundles, unresolved imports) and
// verifies that heavy vendor engines stay behind dynamic import() boundaries.
//
// Run from the plugin directory:  node scripts/compile-check.mjs
// Writes bundle sizes on success; exits non-zero with the compiler's error.
import { createRequire } from "module";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_SOURCE_LINES = 600;
const EXPECTED_VENDOR_BUNDLES = [
  "ui-vendor.js",
  "pdf-vendor.js",
  "pdf-lib-vendor.js",
  "xlsx-vendor.js",
  "trees-vendor.js",
];

for (const bundleName of EXPECTED_VENDOR_BUNDLES) {
  const bundlePath = join(pluginDir, "node_modules", ".paseo-vendor", bundleName);
  if (!existsSync(bundlePath)) {
    console.error(`Missing vendor bundle: ${bundlePath}. Run "npm run build:vendor" first.`);
    process.exit(1);
  }
}

function checkLineLimits(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      checkLineLimits(fullPath);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      const lineCount = readFileSync(fullPath, "utf8").split("\n").length - 1;
      if (lineCount >= MAX_SOURCE_LINES) {
        console.error(
          `File exceeds ${MAX_SOURCE_LINES}-line limit (${lineCount} lines): ${relative(pluginDir, fullPath)}`
        );
        process.exit(1);
      }
    }
  }
}

for (const folder of ["client", "server", "shared", "test", "scripts"]) {
  checkLineLimits(join(pluginDir, folder));
}
for (const rootFile of ["index.client.tsx", "index.server.ts"]) {
  const fullPath = join(pluginDir, rootFile);
  if (existsSync(fullPath)) {
    const lineCount = readFileSync(fullPath, "utf8").split("\n").length - 1;
    if (lineCount >= MAX_SOURCE_LINES) {
      console.error(
        `File exceeds ${MAX_SOURCE_LINES}-line limit (${lineCount} lines): ${rootFile}`
      );
      process.exit(1);
    }
  }
}

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

// Verify static import closures so heavy vendor bundles and lazy viewers never
// leak into eager startup or island bundles.
const requireFromCompiler = createRequire(compilerPath);
const esbuild = requireFromCompiler("esbuild");
const { metafile } = await esbuild.build({
  entryPoints: [join(pluginDir, "index.client.tsx")],
  bundle: true,
  write: false,
  metafile: true,
  format: "cjs",
  platform: "browser",
  absWorkingDir: pluginDir,
  external: [
    "@getpaseo/plugin",
    "@getpaseo/plugin/*",
    "zod",
    "react",
    "react-native",
    "react/jsx-runtime",
    "lucide-react-native",
    "react-native-svg",
    "@tanstack/react-query",
  ],
});

function collectStaticClosure(entryRelPath) {
  const visited = new Set();
  const queue = [entryRelPath];
  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr || visited.has(curr)) continue;
    visited.add(curr);
    const info = metafile.inputs[curr];
    if (!info) continue;
    for (const imp of info.imports) {
      if (imp.kind !== "dynamic-import" && !imp.external) {
        queue.push(imp.path);
      }
    }
  }
  return [...visited];
}

const startupClosure = collectStaticClosure("index.client.tsx");
const startupVendors = startupClosure.filter((p) => p.includes(".paseo-vendor"));
if (startupVendors.length > 0) {
  console.error(
    `Eager startup closure of index.client.tsx must not include vendor bundles, found: ${startupVendors.join(", ")}`
  );
  process.exit(1);
}

const FORBIDDEN_EAGER_ISLAND_MODULES = [
  "node_modules/.paseo-vendor/pdf-vendor.js",
  "node_modules/.paseo-vendor/pdf-lib-vendor.js",
  "node_modules/.paseo-vendor/xlsx-vendor.js",
  "client/vendor/pdf-viewer.tsx",
  "client/vendor/pdf-viewer/pdf-editor.tsx",
  "client/vendor/xlsx-viewer/xlsx-surface.tsx",
  "client/viewers/text-viewer.tsx",
  "client/viewers/image-viewer.tsx",
  "client/vendor/stub-viewer.tsx",
];

for (const islandEntry of [
  "client/file-explorer-island.web.tsx",
  "client/file-viewer-island.web.tsx",
]) {
  const closure = collectStaticClosure(islandEntry);
  const leaked = FORBIDDEN_EAGER_ISLAND_MODULES.filter((mod) =>
    closure.includes(mod)
  );
  if (leaked.length > 0) {
    console.error(
      `Static closure of ${islandEntry} leaked lazy module(s): ${leaked.join(", ")}`
    );
    process.exit(1);
  }
}

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
console.log("COMPILE OK (static import closures verified)");
