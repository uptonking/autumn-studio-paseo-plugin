// Pre-bundles heavy client third-party packages into 5 domain vendor modules
// under node_modules/.paseo-vendor/ so the stock Paseo plugin compiler's
// boundary check (checkSourceImports) resolves them in O(1) without walking
// thousands of nested .js / .d.ts files in node_modules.
//
// Imports and named bindings are discovered automatically by scanning
// client/**/*.{ts,tsx} and index.client.tsx with TypeScript's AST parser, so
// adding new lucide-react icons, @base-ui/react/* components, or @embedpdf/*
// subpaths requires no manual edits to this script.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(pluginDir, "node_modules", ".paseo-vendor");

function resolveTool(pkgName) {
  const candidates = [
    path.join(pluginDir, "package.json"),
    path.resolve(pluginDir, "../../paseo/package.json"),
    path.resolve(pluginDir, "../../paseo/packages/server/package.json"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const req = createRequire(candidate);
      return req(pkgName);
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(`Could not resolve ${pkgName} for scripts/bundle-vendor.js`);
}

const esbuild = resolveTool("esbuild");
const ts = resolveTool("typescript");

const HOST_EXTERNAL_RE =
  /^(react|react\/jsx-runtime|react-native|@tanstack\/react-query|zod|@getpaseo\/plugin)(\/|$)/;

function walkSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
    } else if (
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectClientThirdPartyImports() {
  const sourceFiles = [
    ...walkSourceFiles(path.join(pluginDir, "client")),
    path.join(pluginDir, "index.client.tsx"),
  ];
  /** @type {Map<string, Set<string>>} */
  const bindingsBySpecifier = new Map();

  function recordBinding(specifier, binding) {
    if (specifier.startsWith(".") || HOST_EXTERNAL_RE.test(specifier)) return;
    let set = bindingsBySpecifier.get(specifier);
    if (!set) {
      set = new Set();
      bindingsBySpecifier.set(specifier, set);
    }
    if (binding) set.add(binding);
  }

  for (const file of sourceFiles) {
    const sourceText = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
    );

    function visit(node) {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text;
        const clause = node.importClause;
        if (clause && !clause.isTypeOnly) {
          if (clause.name) {
            recordBinding(spec, "default");
          }
          const named = clause.namedBindings;
          if (named && ts.isNamedImports(named)) {
            for (const el of named.elements) {
              if (!el.isTypeOnly) {
                recordBinding(spec, (el.propertyName ?? el.name).text);
              }
            }
          } else if (named && ts.isNamespaceImport(named)) {
            recordBinding(spec, "*");
          }
        }
      } else if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text;
        if (!node.exportClause) {
          recordBinding(spec, "*");
        } else if (ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            if (!el.isTypeOnly) {
              recordBinding(spec, (el.propertyName ?? el.name).text);
            }
          }
        }
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const spec = node.arguments[0].text;
        const parent = node.parent;
        const varDecl =
          parent && ts.isAwaitExpression(parent) && parent.parent && ts.isVariableDeclaration(parent.parent)
            ? parent.parent
            : null;
        if (
          varDecl &&
          ts.isObjectBindingPattern(varDecl.name) &&
          varDecl.name.elements.every((el) => !el.dotDotDotToken)
        ) {
          for (const el of varDecl.name.elements) {
            const propName = el.propertyName ?? el.name;
            if (ts.isIdentifier(propName)) {
              recordBinding(spec, propName.text);
            }
          }
        } else {
          recordBinding(spec, "*");
        }
      }
      ts.forEachChild(node, visit);
    }

    ts.forEachChild(sf, function walkWithParents(node) {
      node.parent = sf;
      function attachParents(child) {
        ts.forEachChild(child, (grandChild) => {
          grandChild.parent = child;
          attachParents(grandChild);
        });
      }
      attachParents(node);
    });
    visit(sf);
  }

  return bindingsBySpecifier;
}

function classifyBundleGroup(specifier) {
  if (
    specifier === "react-dom" ||
    specifier.startsWith("react-dom/") ||
    specifier.startsWith("@base-ui/react/") ||
    specifier === "class-variance-authority" ||
    specifier === "clsx" ||
    specifier === "cmdk" ||
    specifier === "tailwind-merge" ||
    specifier === "lucide-react"
  ) {
    return "ui";
  }
  if (specifier.startsWith("@embedpdf/")) {
    return "pdf";
  }
  if (specifier === "pdf-lib") {
    return "pdf-lib";
  }
  if (specifier === "@extend-ai/react-xlsx") {
    return "xlsx";
  }
  if (specifier === "@pierre/trees" || specifier.startsWith("@pierre/trees/")) {
    return "trees";
  }
  throw new Error(
    `Unclassified third-party client dependency "${specifier}". Add its mapping to scripts/bundle-vendor.js and tsconfig.json.`,
  );
}

function buildBundleEntrySource(group, entries) {
  const lines = [];
  const exportedNames = new Map();

  function trackExport(name, specifier) {
    const prev = exportedNames.get(name);
    if (prev && prev !== specifier) {
      throw new Error(
        `Export name collision in ${group}-vendor.js: "${name}" is exported by both "${prev}" and "${specifier}".`,
      );
    }
    exportedNames.set(name, specifier);
  }

  for (const [specifier, bindings] of entries) {
    if (specifier === "react-dom") {
      lines.push(`import ReactDOM from "react-dom";`);
      for (const name of [...bindings].sort()) {
        if (name === "default" || name === "*") continue;
        trackExport(name, specifier);
        lines.push(`export const ${name} = ReactDOM.${name};`);
      }
      continue;
    }
    if (specifier === "react-dom/client") {
      lines.push(`import ReactDOMClient from "react-dom/client";`);
      for (const name of [...bindings].sort()) {
        if (name === "default" || name === "*") continue;
        trackExport(name, specifier);
        lines.push(`export const ${name} = ReactDOMClient.${name};`);
      }
      continue;
    }

    const targetSpecifier =
      specifier === "pdf-lib"
        ? "pdf-lib/dist/pdf-lib.esm.min.js"
        : specifier;

    const namedBindings = [...bindings]
      .filter((b) => b !== "*" && b !== "default")
      .sort();

    if (bindings.has("*")) {
      lines.push(`export * from ${JSON.stringify(targetSpecifier)};`);
    } else if (namedBindings.length > 0) {
      for (const name of namedBindings) {
        trackExport(name, specifier);
      }
      lines.push(
        `export { ${namedBindings.join(", ")} } from ${JSON.stringify(targetSpecifier)};`,
      );
    }
  }

  return lines.join("\n") + "\n";
}

const bindingsBySpecifier = collectClientThirdPartyImports();
/** @type {Record<"ui" | "pdf" | "pdf-lib" | "xlsx" | "trees", Array<[string, Set<string>]>>} */
const groups = { ui: [], pdf: [], "pdf-lib": [], xlsx: [], trees: [] };

for (const [specifier, bindings] of [...bindingsBySpecifier.entries()].sort()) {
  if (bindings.size === 0) continue;
  const group = classifyBundleGroup(specifier);
  groups[group].push([specifier, bindings]);
}

fs.mkdirSync(outDir, { recursive: true });

const EXTERNAL = [
  "react",
  "react/jsx-runtime",
  "react-native",
  "@tanstack/react-query",
  "zod",
  "@getpaseo/plugin",
  "@getpaseo/plugin/*",
];

const COMMON_OPTIONS = {
  absWorkingDir: pluginDir,
  tsconfig: path.join(pluginDir, "tsconfig.typecheck.json"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "neutral",
  target: "es2020",
  mainFields: ["module", "main"],
  external: EXTERNAL,
  logLevel: "warning",
};

await Promise.all(
  Object.entries(groups).map(([group, entries]) =>
    esbuild.build({
      ...COMMON_OPTIONS,
      stdin: {
        resolveDir: pluginDir,
        contents: buildBundleEntrySource(group, entries),
      },
      outfile: path.join(outDir, `${group}-vendor.js`),
    }),
  ),
);

console.log("✓ Built .paseo-vendor bundles (ui, pdf, pdf-lib, xlsx, trees)");
