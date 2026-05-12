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
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renameIdentifiersInText(text, renameMap) {
  // best-effort: replace identifier-like words only
  // e.g. original: foo -> id1, keep other text intact
  for (const [from, to] of Object.entries(renameMap)) {
    // \b works for identifier boundaries in ASCII-ish text; acceptable for comments.
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
    text = text.replace(re, to);
  }
  return text;
}

function convertLineCommentsToBlock(ast) {
  if (!ast || !Array.isArray(ast.comments)) return;
  for (const c of ast.comments) {
    if (c && c.type === "CommentLine") {
      c.type = "CommentBlock";
      // Babel expects no leading // in value for CommentBlock; it will add /* */
      // Keep original content:
      c.value = c.value.trim();
    }
  }
}

function obfuscateIdentifiersWithKeyAst(code, ext) {
  const ast = parseCode(code, ext);

  const crypto = require("crypto");
  const mapping = {}; // original -> hashToken

  function hashToken(name) {
    const digest = crypto
      .createHash("sha256")
      .update(name, "utf8")
      .digest("base64url");
    const hex = Buffer.from(digest, "base64url").toString("hex");
    return `h${hex.slice(0, 12)}`;
  }

  function getToken(name) {
    if (mapping[name]) return mapping[name];
    const token = hashToken(name);
    mapping[name] = token;
    return token;
  }

  traverse(ast, {
    enter(p) {
      const scope = p.scope;
      if (!scope) return;

      const bindings = scope.bindings || {};
      for (const [name, binding] of Object.entries(bindings)) {
        if (!binding) continue;

        const newName = getToken(name);
        if (newName === name) continue;

        try {
          scope.rename(name, newName);
        } catch {
          // ignore rename failures (rare collisions)
        }
      }
    },
  });

  // 1) convert //comment into /* ... */ so it "survives" minify style consistently
  // 2) ensure identifiers mentioned in comments also get mapped
  // 3) apply the same identifier rename mapping to comment text
  convertLineCommentsToBlock(ast);

  function collectIdentifierWords(text) {
    // JS identifier-ish words (best-effort) for comments
    // - allows $, _, letters; includes digits after first char
    const re = /[$A-Z_][0-9A-Z_$]*/gi;
    const out = new Set();
    let m;
    while ((m = re.exec(text))) out.add(m[0]);
    return out;
  }

  if (Array.isArray(ast.comments)) {
    for (const c of ast.comments) {
      if (!c || typeof c.value !== "string") continue;

      // populate mapping so comment identifiers appear in .syamkey
      for (const name of collectIdentifierWords(c.value)) {
        getToken(name);
      }

      c.value = renameIdentifiersInText(c.value, mapping);
    }
  }

  const out = generate(ast, {
    jsescOption: { minimal: true },
    compact: true,
    comments: true,
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

  // Restore identifiers inside comment text too (comments are preserved in output)
  if (Array.isArray(ast.comments)) {
    for (const c of ast.comments) {
      if (!c || typeof c.value !== "string") continue;
      c.value = renameIdentifiersInText(c.value, reverse);
    }
  }

  const out = generate(ast, {
    jsescOption: { minimal: true },
    compact: true,
    comments: true,
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
