#!/usr/bin/env node

/*
  syamcode - minify + reversible identifier obfuscation (Babel AST, no wrong keyword/property replacement)

  Commands:
    - Minify:
      npx syamcode <inputPath> <outputPath>
      Generates: <outputPath> and <outputPath>.syamkey

    - Restore:
      npx syamcode restore <minifiedPath> <syamkeyPath> <outputPath>
*/

const fs = require("fs");
const path = require("path");

const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

function fail(msg) {
  console.error(`[syamcode] ${msg}`);
  process.exit(1);
}

function detectExt(p) {
  return path.extname(p).toLowerCase();
}

function isCodeExt(ext) {
  // Only support reversible identifier obfuscation for:
  // - .js (including .mjs modules)
  // - .mjs
  return [".js", ".mjs"].includes(ext);
}

function parseCode(code, ext) {
  const plugins = [
    "jsx",
    "typescript",
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "decorators-legacy",
    "dynamicImport",
    "exportDefaultFrom",
    "exportNamespaceFrom",
    "importMeta",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    "topLevelAwait",
    "logicalAssignment",
    "numericSeparator",
  ];

  // Best-effort: if file is plain .js, typescript plugin is harmless for many cases,
  // but to keep parse stricter we could branch by ext. For simplicity, keep it enabled.
  return parser.parse(code, {
    sourceType: "module",
    plugins,
  });
}

// Keep non-JS minification simple (existing behavior)
function stripCssAndMinify(css) {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/[\t\r\n]+/g, " ");
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/\s*([{}:;,])\s*/g, "$1");
  return out.trim();
}
function minifyHtmlLike(html) {
  let out = html.replace(/<!--([\s\S]*?)-->/g, "");
  out = out.replace(/>\s+</g, "><");
  out = out.replace(/\s{2,}/g, " ");
  return out.trim();
}
function minifyJson(jsonText) {
  const obj = JSON.parse(jsonText);
  return JSON.stringify(obj);
}
function minifySvg(svgText) {
  let out = svgText.replace(/<!--([\s\S]*?)-->/g, "");
  out = out.replace(/[\t\r\n]+/g, " ");
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/\s*([<>"'=;,:{}()])\s*/g, "$1");
  return out.trim();
}

function minifyByExtNonAst(inputPath, content) {
  const ext = detectExt(inputPath);
  switch (ext) {
    case ".css":
      return stripCssAndMinify(content);
    case ".html":
    case ".htm":
      return minifyHtmlLike(content);
    case ".json":
      return minifyJson(content);
    case ".svg":
      return minifySvg(content);
    default:
      return content
        .replace(/[\t\r\n]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
  }
}

// ---------- Reversible identifier rename (binding-safe via Babel) ----------
// key mapping format:
// {
//   format: "syamcode-key-v2",
//   version: 2,
//   sourceExt: ".js",
//   mapping: { "originalName": "id1", ... }
// }
function obfuscateIdentifiersWithKeyAst(code, ext) {
  const ast = parseCode(code, ext);

  const crypto = require("crypto");
  const mapping = {}; // original -> hashToken

  function hashToken(name) {
    // Biar aman untuk identifier JS (tanpa simbol), pakai base64url dan ambil prefix.
    // Contoh hasil: h_a9f3c2e1f4c0
    const digest = crypto
      .createHash("sha256")
      .update(name, "utf8")
      .digest("base64url");
    // Hindari karakter yang tidak aman untuk identifier.
    // Kita tetap pakai awalan 'h' dan ambil hanya hex alfanumerik (tanpa '-').
    const hex = Buffer.from(digest, "base64url").toString("hex");
    return `h${hex}`;
  }

  function getToken(name) {
    if (mapping[name]) return mapping[name];
    if (/^h[a-f0-9]{64}$/.test(name)) return name;
    const token = hashToken(name);
    mapping[name] = token;
    return token;
  }

  // Rename bindings using scope.rename so references are updated.
  // Also: skip renaming globals/builtins by checking binding existence;
  // scope.rename only works for bindings within scopes.
  traverse(ast, {
    Program(programPath) {
      // Walk all bindings in the whole program by visiting scopes.
      // traverse will also visit nested scopes.
      // We'll collect bindings from every scope.
    },
    enter(p) {
      const scope = p.scope;
      if (!scope) return;

      // For each scope, rename its own bindings.
      // bindings is a Map-like object: scope.bindings[name]
      const bindings = scope.bindings || {};
      for (const [name, binding] of Object.entries(bindings)) {
        if (!binding) continue;
        if (binding.path.parent.type.startsWith("Import")) continue;
        if (/^h[a-f0-9]{64}$/.test(name)) continue;
        const newName = getToken(name);

        // Prevent trying to rename to same name
        if (newName === name) continue;

        // Babel's scope.rename(oldName, newName) renames binding + references in that scope.
        // But calling multiple times across nested scopes can conflict; still best-effort.
        try {
          scope.rename(name, newName);
        } catch {
          // ignore rename failures (rare collisions)
        }
      }
    },
  });

  const out = generate(ast, {
    jsescOption: { minimal: true },
    compact: true,
    comments: false,
  }).code;

  return { obfuscated: out, mapping };
}

function restoreIdentifiersFromKeyAst(minifiedCode, keyObj, extHint) {
  if (!keyObj || keyObj.format !== "syamcode-key-v2" || !keyObj.mapping) {
    fail("Invalid .syamkey format. Expected syamcode-key-v2.");
  }

  // reverse mapping: token -> original
  const reverse = {};
  for (const [orig, token] of Object.entries(keyObj.mapping)) {
    reverse[token] = orig;
  }

  const ast = parseCode(minifiedCode, extHint || keyObj.sourceExt || ".js");

  traverse(ast, {
    enter(p) {
      const scope = p.scope;
      if (!scope) return;

      const bindings = scope.bindings || {};
      for (const [name, binding] of Object.entries(bindings)) {
        if (!binding) continue;
        if (binding.path.parent.type.startsWith("Import")) continue;
        if (!reverse[name]) continue;

        const newName = reverse[name];
        if (newName === name) continue;

        try {
          scope.rename(name, newName);
        } catch {
          // ignore
        }
      }
    },
  });

  const out = generate(ast, {
    jsescOption: { minimal: true },
    compact: true,
    comments: false,
  }).code;

  return out;
}

// ---------- CLI ----------
function handleMinify(inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) fail(`Input path not found: ${inputPath}`);

  const stat = fs.statSync(inputPath);
  if (!stat.isFile()) fail("Input must be a file path (bukan folder).");

  const input = fs.readFileSync(inputPath, "utf8");
  const ext = detectExt(inputPath);

  if (!isCodeExt(ext)) {
    fail(
      `Unsupported file extension: "${ext}". syamcode only supports ".js" and ".mjs".`,
    );
  }

  const syamkeyPath = `${outputPath}.syamkey`;

  const { obfuscated, mapping } = obfuscateIdentifiersWithKeyAst(input, ext);

  let keyObj = {
    format: "syamcode-key-v2",
    version: 2,
    sourceExt: ext,
    mapping,
    createdAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, obfuscated, "utf8");
  fs.writeFileSync(syamkeyPath, JSON.stringify(keyObj, null, 0), "utf8");

  console.log(`[syamcode] Minified: ${inputPath} -> ${outputPath}`);
  console.log(`[syamcode] Key: ${outputPath}.syamkey -> generated`);
}

function handleRestore(minifiedPath, syamkeyPath, outputPath) {
  if (!fs.existsSync(minifiedPath))
    fail(`Minified file not found: ${minifiedPath}`);
  if (!fs.existsSync(syamkeyPath))
    fail(`Syamkey file not found: ${syamkeyPath}`);

  const minified = fs.readFileSync(minifiedPath, "utf8");
  const keyRaw = fs.readFileSync(syamkeyPath, "utf8");

  let keyObj;
  try {
    keyObj = JSON.parse(keyRaw);
  } catch {
    fail("Failed to parse syamkey JSON.");
  }

  const extHint = detectExt(minifiedPath);
  const restored = restoreIdentifiersFromKeyAst(minified, keyObj, extHint);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, restored, "utf8");
  console.log(
    `[syamcode] Restored identifiers: ${minifiedPath} -> ${outputPath}`,
  );
}

function main() {
  const args = process.argv.slice(2);

  if (args.length >= 1 && args[0] === "restore") {
    if (args.length < 4) {
      fail(
        "Invalid arguments. Usage: npx syamcode restore <minifiedPath> <syamkeyPath> <outputPath>",
      );
    }
    handleRestore(args[1], args[2], args[3]);
    return;
  }

  if (args.length < 2) {
    fail("Invalid arguments. Usage: npx syamcode <inputPath> <outputPath>");
  }

  handleMinify(args[0], args[1]);
}

main();
