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

import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as parser from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
const traverse = traverseModule.default;
const generate = generateModule.default;
function fail(msg) {
  console.error(`[syamcode] ${msg}`);
  process.exit(1);
}
function detectExt(p) {
  return path.extname(p).toLowerCase();
}
function isCodeExt(ext) {
  return [".js", ".mjs", ".cjs"].includes(ext);
}
function getParserPlugins() {
  return [
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
}

function parseCode(code, ext) {
  return parser.parse(code, {
    sourceType: "unambiguous",
    allowReturnOutsideFunction: true,
    plugins: getParserPlugins(),
  });
}

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
function parseBundleStatements(code) {
  return parseCode(code, ".js").program.body;
}
function parseBundleExpression(code) {
  return parser.parseExpression(code, { plugins: getParserPlugins() });
}
function isLocalModuleSpecifier(specifier) {
  return (
    typeof specifier === "string" &&
    (specifier.startsWith("./") ||
      specifier.startsWith("../") ||
      specifier.startsWith("/"))
  );
}
function getStringLiteralValue(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
}
function isRequireCall(node) {
  return (
    node &&
    node.type === "CallExpression" &&
    node.callee &&
    node.callee.type === "Identifier" &&
    node.callee.name === "require" &&
    getStringLiteralValue(node.arguments && node.arguments[0])
  );
}
function resolveDependencyPath(fromPath, specifier) {
  if (!isLocalModuleSpecifier(specifier)) return null;
  const basePath = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [];
  if (detectExt(basePath)) {
    candidates.push(basePath);
  } else {
    candidates.push(`${basePath}.js`, `${basePath}.mjs`, `${basePath}.cjs`);
    candidates.push(
      path.join(basePath, "index.js"),
      path.join(basePath, "index.mjs"),
      path.join(basePath, "index.cjs"),
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = detectExt(candidate);
      if (!isCodeExt(ext)) {
        fail(`Unsupported dependency extension: "${ext}" in ${candidate}`);
      }
      return path.resolve(candidate);
    }
  }
  fail(`Unable to resolve local dependency "${specifier}" from ${fromPath}`);
}
function getNodeName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "StringLiteral" || node.type === "Literal") {
    return String(node.value);
  }
  return null;
}
function isIdentifierName(name) {
  return /^[$A-Z_a-z][$\w]*$/.test(name);
}
function propAccess(objectName, propertyName) {
  if (isIdentifierName(propertyName)) return `${objectName}.${propertyName}`;
  return `${objectName}[${JSON.stringify(propertyName)}]`;
}
function makeExportAssignment(exportedName, expressionCode) {
  return `${propAccess("exports", exportedName)}=${expressionCode};`;
}
function collectPatternNames(pattern, names = []) {
  if (!pattern) return names;
  switch (pattern.type) {
    case "Identifier":
      names.push(pattern.name);
      break;
    case "ObjectPattern":
      for (const property of pattern.properties || []) {
        if (property.type === "RestElement") {
          collectPatternNames(property.argument, names);
        } else {
          collectPatternNames(property.value, names);
        }
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements || []) {
        collectPatternNames(element, names);
      }
      break;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, names);
      break;
    case "RestElement":
      collectPatternNames(pattern.argument, names);
      break;
  }
  return names;
}
function detectModuleKind(ast) {
  let hasEsm = false;
  let hasCommonJs = false;
  traverse(ast, {
    ImportDeclaration() {
      hasEsm = true;
    },
    ExportNamedDeclaration() {
      hasEsm = true;
    },
    ExportDefaultDeclaration() {
      hasEsm = true;
    },
    ExportAllDeclaration() {
      hasEsm = true;
    },
    CallExpression(p) {
      if (isRequireCall(p.node)) hasCommonJs = true;
    },
    MemberExpression(p) {
      const node = p.node;
      if (
        node.object &&
        node.object.type === "Identifier" &&
        (node.object.name === "module" || node.object.name === "exports")
      ) {
        hasCommonJs = true;
      }
    },
  });
  if (hasEsm && hasCommonJs) return "mixed";
  if (hasEsm) return "esm";
  if (hasCommonJs) return "commonjs";
  return "script";
}
function collectLocalDependencies(filePath, ast) {
  const dependencies = [];
  const seen = new Set();
  function addDependency(specifier, kind) {
    const resolvedPath = resolveDependencyPath(filePath, specifier);
    if (!resolvedPath || seen.has(resolvedPath)) return;
    seen.add(resolvedPath);
    dependencies.push({ specifier, filePath: resolvedPath, kind });
  }
  traverse(ast, {
    ImportDeclaration(p) {
      addDependency(p.node.source.value, "import");
    },
    ExportNamedDeclaration(p) {
      if (p.node.source) addDependency(p.node.source.value, "export");
    },
    ExportAllDeclaration(p) {
      if (p.node.source) addDependency(p.node.source.value, "export");
    },
    CallExpression(p) {
      if (!isRequireCall(p.node)) return;
      const specifier = getStringLiteralValue(p.node.arguments[0]);
      addDependency(specifier, "require");
    },
  });
  return dependencies;
}
function createBundleGraph(entryPath) {
  const modules = [];
  const moduleByPath = new Map();
  function visit(filePath) {
    const absolutePath = path.resolve(filePath);
    if (moduleByPath.has(absolutePath)) return moduleByPath.get(absolutePath);
    const code = fs.readFileSync(absolutePath, "utf8");
    const ast = parseCode(code, detectExt(absolutePath));
    const moduleInfo = {
      id: modules.length,
      filePath: absolutePath,
      code,
      ast,
      moduleKind: detectModuleKind(ast),
      dependencies: [],
    };
    modules.push(moduleInfo);
    moduleByPath.set(absolutePath, moduleInfo);
    moduleInfo.dependencies = collectLocalDependencies(absolutePath, ast);
    for (const dependency of moduleInfo.dependencies) {
      visit(dependency.filePath);
    }
    return moduleInfo;
  }
  visit(entryPath);
  return { modules, moduleByPath };
}
function replaceLocalRequireCalls(ast, filePath, moduleByPath) {
  traverse(ast, {
    CallExpression(p) {
      if (!isRequireCall(p.node)) return;
      const specifier = getStringLiteralValue(p.node.arguments[0]);
      const resolvedPath = resolveDependencyPath(filePath, specifier);
      if (!resolvedPath) return;
      const dependency = moduleByPath.get(resolvedPath);
      if (!dependency) {
        fail(`Dependency was not collected: ${resolvedPath}`);
      }
      p.replaceWith(parseBundleExpression(`__syamcode_require(${dependency.id})`));
    },
  });
}
function makeImportReplacementStatements(importNode, moduleInfo, moduleByPath) {
  const specifier = importNode.source.value;
  const resolvedPath = resolveDependencyPath(moduleInfo.filePath, specifier);
  if (!resolvedPath) return null;
  const dependency = moduleByPath.get(resolvedPath);
  const tempName = `__syamcode_import_${moduleInfo.id}_${dependency.id}`;
  const statements = [`const ${tempName}=__syamcode_require(${dependency.id});`];
  if (!importNode.specifiers.length) {
    return parseBundleStatements(`__syamcode_require(${dependency.id});`);
  }
  for (const importSpecifier of importNode.specifiers) {
    if (importSpecifier.type === "ImportDefaultSpecifier") {
      statements.push(`const ${importSpecifier.local.name}=${tempName}.default;`);
      continue;
    }
    if (importSpecifier.type === "ImportNamespaceSpecifier") {
      statements.push(`const ${importSpecifier.local.name}=${tempName};`);
      continue;
    }
    if (importSpecifier.type === "ImportSpecifier") {
      const importedName = getNodeName(importSpecifier.imported);
      statements.push(
        `const ${importSpecifier.local.name}=${propAccess(tempName, importedName)};`,
      );
    }
  }
  return parseBundleStatements(statements.join(""));
}
function makeExportNamedReplacementStatements(exportNode, moduleInfo, moduleByPath) {
  const statements = [];
  if (exportNode.declaration) {
    statements.push(exportNode.declaration);
    if (exportNode.declaration.type === "VariableDeclaration") {
      for (const declaration of exportNode.declaration.declarations || []) {
        for (const name of collectPatternNames(declaration.id)) {
          statements.push(...parseBundleStatements(makeExportAssignment(name, name)));
        }
      }
      return statements;
    }
    const declarationName = getNodeName(exportNode.declaration.id);
    if (declarationName) {
      statements.push(
        ...parseBundleStatements(makeExportAssignment(declarationName, declarationName)),
      );
    }
    return statements;
  }
  if (exportNode.source) {
    const resolvedPath = resolveDependencyPath(moduleInfo.filePath, exportNode.source.value);
    if (!resolvedPath) {
      fail(`External re-export is not supported: ${exportNode.source.value}`);
    }
    const dependency = moduleByPath.get(resolvedPath);
    const tempName = `__syamcode_reexport_${moduleInfo.id}_${dependency.id}`;
    statements.push(
      ...parseBundleStatements(`const ${tempName}=__syamcode_require(${dependency.id});`),
    );
    for (const exportSpecifier of exportNode.specifiers || []) {
      if (exportSpecifier.type === "ExportNamespaceSpecifier") {
        const exportedName = getNodeName(exportSpecifier.exported);
        statements.push(
          ...parseBundleStatements(makeExportAssignment(exportedName, tempName)),
        );
        continue;
      }
      const localName = getNodeName(exportSpecifier.local);
      const exportedName = getNodeName(exportSpecifier.exported);
      statements.push(
        ...parseBundleStatements(
          makeExportAssignment(exportedName, propAccess(tempName, localName)),
        ),
      );
    }
    return statements;
  }
  for (const exportSpecifier of exportNode.specifiers || []) {
    const localName = getNodeName(exportSpecifier.local);
    const exportedName = getNodeName(exportSpecifier.exported);
    statements.push(
      ...parseBundleStatements(makeExportAssignment(exportedName, localName)),
    );
  }
  return statements;
}
function makeExportDefaultReplacementStatements(exportNode, moduleInfo) {
  const declaration = exportNode.declaration;
  if (
    (declaration.type === "FunctionDeclaration" ||
      declaration.type === "ClassDeclaration") &&
    declaration.id
  ) {
    return [
      declaration,
      ...parseBundleStatements(makeExportAssignment("default", declaration.id.name)),
    ];
  }
  const defaultName = `__syamcode_default_${moduleInfo.id}`;
  const declarationCode = generate(declaration, {
    jsescOption: { minimal: true },
    comments: false,
  }).code;
  return parseBundleStatements(
    `const ${defaultName}=${declarationCode};${makeExportAssignment("default", defaultName)}`,
  );
}
function makeExportAllReplacementStatements(exportNode, moduleInfo, moduleByPath) {
  const resolvedPath = resolveDependencyPath(moduleInfo.filePath, exportNode.source.value);
  if (!resolvedPath) {
    fail(`External export-all is not supported: ${exportNode.source.value}`);
  }
  const dependency = moduleByPath.get(resolvedPath);
  return parseBundleStatements(`Object.assign(exports,__syamcode_require(${dependency.id}));`);
}
function transformModuleForBundle(moduleInfo, moduleByPath, externalImports) {
  const ast = parseCode(moduleInfo.code, detectExt(moduleInfo.filePath));
  replaceLocalRequireCalls(ast, moduleInfo.filePath, moduleByPath);
  const body = [];
  for (const node of ast.program.body) {
    if (node.type === "ImportDeclaration") {
      const importReplacement = makeImportReplacementStatements(
        node,
        moduleInfo,
        moduleByPath,
      );
      if (importReplacement) {
        body.push(...importReplacement);
      } else {
        externalImports.add(
          generate(node, { jsescOption: { minimal: true }, comments: false }).code,
        );
      }
      continue;
    }
    if (node.type === "ExportNamedDeclaration") {
      body.push(...makeExportNamedReplacementStatements(node, moduleInfo, moduleByPath));
      continue;
    }
    if (node.type === "ExportDefaultDeclaration") {
      body.push(...makeExportDefaultReplacementStatements(node, moduleInfo));
      continue;
    }
    if (node.type === "ExportAllDeclaration") {
      body.push(...makeExportAllReplacementStatements(node, moduleInfo, moduleByPath));
      continue;
    }
    body.push(node);
  }
  ast.program.body = body;
  return generate(ast, {
    jsescOption: { minimal: true },
    compact: false,
    comments: false,
  }).code;
}
function createBundle(inputPath) {
  const graph = createBundleGraph(inputPath);
  const externalImports = new Set();
  const moduleEntries = graph.modules.map((moduleInfo) => {
    const moduleCode = transformModuleForBundle(
      moduleInfo,
      graph.moduleByPath,
      externalImports,
    );
    return `${moduleInfo.id}(module,exports,__syamcode_require){${moduleCode}}`;
  });
  const externalImportCode = Array.from(externalImports).join("\n");
  const bundleCode = `${externalImportCode}
const __syamcode_modules={${moduleEntries.join(",")}};
const __syamcode_cache={};
function __syamcode_require(id){
  if(__syamcode_cache[id]) return __syamcode_cache[id].exports;
  const module={exports:{}};
  __syamcode_cache[id]=module;
  __syamcode_modules[id](module,module.exports,__syamcode_require);
  return module.exports;
}
__syamcode_require(0);`;
  return {
    code: bundleCode,
    modules: graph.modules,
    enabled: graph.modules.some((moduleInfo) => moduleInfo.dependencies.length > 0),
  };
}
function obfuscateIdentifiersWithKeyAst(code, ext) {
  const ast = parseCode(code, ext);
  const mapping = {};
  function hashToken(name) {
    const digest = crypto
      .createHash("sha256")
      .update(name, "utf8")
      .digest("base64url");
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
  traverse(ast, {
    Program(programPath) {},
    enter(p) {
      const scope = p.scope;
      if (!scope) return;
      const bindings = scope.bindings || {};
      for (const [name, binding] of Object.entries(bindings)) {
        if (!binding) continue;
        if (binding.path.parent.type.startsWith("Import")) continue;
        if (/^h[a-f0-9]{64}$/.test(name)) continue;
        const newName = getToken(name);
        if (newName === name) continue;
        try {
          scope.rename(name, newName);
        } catch {}
      }
    },
  });
  const out = generate(ast, {
    jsescOption: { minimal: true },
    compact: true,
    comments: false,
  }).code;
  return { obfuscated: out, mapping: mapping };
}
function isSupportedSyamkeyFormat(keyObj) {
  if (!keyObj || typeof keyObj !== "object") return false;
  if (!keyObj.mapping || typeof keyObj.mapping !== "object") return false;
  const isV3 = keyObj.format === "syamkey" && Number(keyObj.version) === 3;
  const isLegacyV2 = keyObj.format === "syamcode-key-v2";
  return isV3 || isLegacyV2;
}
function restoreIdentifiersFromKeyAst(minifiedCode, keyObj, extHint) {
  if (!isSupportedSyamkeyFormat(keyObj)) {
    fail(
      'Invalid .syamkey format. Expected format="syamkey" (version 3) or legacy format="syamcode-key-v2".',
    );
  }
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
        } catch {}
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
function handleMinify(inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) fail(`Input path not found: ${inputPath}`);
  const stat = fs.statSync(inputPath);
  if (!stat.isFile()) fail("Input must be a file path (bukan folder).");
  const input = fs.readFileSync(inputPath, "utf8");
  const ext = detectExt(inputPath);
  if (!isCodeExt(ext)) {
    fail(
      `Unsupported file extension: "${ext}". syamcode only supports ".js", ".mjs", and ".cjs".`,
    );
  }
  const syamkeyPath = `${outputPath}.syamkey`;
  const bundle = createBundle(inputPath);
  const sourceCode = bundle.enabled ? bundle.code : input;
  const { obfuscated: obfuscated, mapping: mapping } =
    obfuscateIdentifiersWithKeyAst(sourceCode, ext);
  let keyObj = {
    format: "syamkey",
    version: 3,
    sourceExt: ext,
    bundle: {
      enabled: bundle.enabled,
      entry: path.relative(process.cwd(), path.resolve(inputPath)),
      files: bundle.modules.map((moduleInfo) => ({
        path: path.relative(process.cwd(), moduleInfo.filePath),
        moduleType: moduleInfo.moduleKind,
      })),
    },
    mapping: mapping,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, obfuscated, "utf8");
  fs.writeFileSync(syamkeyPath, JSON.stringify(keyObj, null, 0), "utf8");
  if (bundle.enabled) {
    console.log(`[syamcode] Bundled: ${bundle.modules.length} file(s)`);
  }
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
