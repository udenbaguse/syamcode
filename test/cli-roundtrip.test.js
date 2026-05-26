import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "bin", "syamcode.js");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "syamcode-cli-test-"));

function runCli(args, cwd = projectRoot) {
  return execFileSync("node", [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function writeFixtureFiles(caseDir, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(caseDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function runRoundtrip(caseName, files, entryFile, outputFile) {
  const caseDir = path.join(tmpDir, caseName);
  fs.mkdirSync(caseDir, { recursive: true });
  writeFixtureFiles(caseDir, files);

  const inputPath = path.join(caseDir, entryFile);
  const minifiedPath = path.join(caseDir, outputFile);
  const syamkeyPath = `${minifiedPath}.syamkey`;
  const restoredPath = path.join(caseDir, `restored-${outputFile}`);

  runCli([inputPath, minifiedPath]);

  assert.ok(fs.existsSync(minifiedPath), `${caseName}: minified file should exist`);
  assert.ok(fs.existsSync(syamkeyPath), `${caseName}: syamkey file should exist`);

  const keyObj = JSON.parse(fs.readFileSync(syamkeyPath, "utf8"));
  assert.equal(keyObj.format, "syamkey");
  assert.equal(Number(keyObj.version), 3);
  assert.ok(keyObj.mapping && typeof keyObj.mapping === "object");

  runCli(["restore", minifiedPath, syamkeyPath, restoredPath]);

  return {
    caseDir,
    keyObj,
    minifiedPath,
    minifiedCode: fs.readFileSync(minifiedPath, "utf8"),
    restoredCode: fs.readFileSync(restoredPath, "utf8"),
  };
}

try {
  const simple = runRoundtrip(
    "simple",
    {
      "input.js": `
const secretValue = 41;
function bump(numberValue) {
  const localTotal = numberValue + 1;
  return localTotal;
}
console.log(bump(secretValue));
`,
    },
    "input.js",
    "output.min.js",
  );

  assert.equal(simple.keyObj.bundle.enabled, false);
  assert.match(simple.restoredCode, /\bsecretValue\b/);
  assert.match(simple.restoredCode, /\bbump\b/);
  assert.match(simple.restoredCode, /\blocalTotal\b/);
  assert.doesNotMatch(simple.restoredCode, /\bh[a-f0-9]{64}\b/);

  const esm = runRoundtrip(
    "esm",
    {
      "entry.mjs": `#!/usr/bin/env node
import label from "./label.js";
import { double } from "./math.js";

const answer = double(21);
console.log(label, answer);
`,
      "label.js": `export default "result";`,
      "math.js": `
export function double(value) {
  return value * 2;
}
`,
    },
    "entry.mjs",
    "bundle.mjs",
  );

  assert.equal(esm.keyObj.bundle.enabled, true);
  assert.equal(esm.keyObj.bundle.files.length, 3);
  assert.doesNotMatch(esm.minifiedCode, /from\s*["']\.\/label\.js["']/);
  assert.doesNotMatch(esm.minifiedCode, /from\s*["']\.\/math\.js["']/);
  assert.equal(
    execFileSync("node", [esm.minifiedPath], {
      cwd: esm.caseDir,
      encoding: "utf8",
    }).trim(),
    "result 42",
  );
  assert.match(esm.restoredCode, /\bdouble\b/);
  assert.match(esm.restoredCode, /\banswer\b/);

  const commonjs = runRoundtrip(
    "commonjs",
    {
      "entry.js": `
const label = require("./label");
const math = require("./math");

console.log(label, math.double(21));
`,
      "label.js": `module.exports = "result";`,
      "math.js": `
exports.double = function double(value) {
  return value * 2;
};
`,
    },
    "entry.js",
    "bundle.js",
  );

  assert.equal(commonjs.keyObj.bundle.enabled, true);
  assert.equal(commonjs.keyObj.bundle.files.length, 3);
  assert.doesNotMatch(commonjs.minifiedCode, /require\(["']\.\/label["']\)/);
  assert.doesNotMatch(commonjs.minifiedCode, /require\(["']\.\/math["']\)/);
  assert.equal(
    execFileSync("node", [commonjs.minifiedPath], {
      cwd: commonjs.caseDir,
      encoding: "utf8",
    }).trim(),
    "result 42",
  );
  assert.match(commonjs.restoredCode, /\bdouble\b/);

  const esmLiveBinding = runRoundtrip(
    "esm-live-binding",
    {
      "entry.mjs": `
import { count, inc } from "./counter.mjs";

console.log(count);
inc();
console.log(count);
`,
      "counter.mjs": `
export let count = 0;
export function inc() {
  count += 1;
}
`,
    },
    "entry.mjs",
    "bundle.mjs",
  );

  assert.equal(
    execFileSync("node", [esmLiveBinding.minifiedPath], {
      cwd: esmLiveBinding.caseDir,
      encoding: "utf8",
    }).trim(),
    "0\n1",
  );

  const cjsDefaultImport = runRoundtrip(
    "cjs-default-import",
    {
      "entry.mjs": `
import label from "./label.cjs";

console.log(label);
`,
      "label.cjs": `module.exports = "result";`,
    },
    "entry.mjs",
    "bundle.mjs",
  );

  assert.equal(
    execFileSync("node", [cjsDefaultImport.minifiedPath], {
      cwd: cjsDefaultImport.caseDir,
      encoding: "utf8",
    }).trim(),
    "result",
  );

  const exportStar = runRoundtrip(
    "export-star",
    {
      "entry.mjs": `
import * as values from "./barrel.mjs";

console.log(Object.prototype.hasOwnProperty.call(values, "default"), values.named);
`,
      "barrel.mjs": `export * from "./child.mjs";`,
      "child.mjs": `
export default "default-value";
export const named = "n";
`,
    },
    "entry.mjs",
    "bundle.mjs",
  );

  assert.equal(
    execFileSync("node", [exportStar.minifiedPath], {
      cwd: exportStar.caseDir,
      encoding: "utf8",
    }).trim(),
    "false n",
  );

  const esmEntryExport = runRoundtrip(
    "esm-entry-export",
    {
      "entry.mjs": `
import { double } from "./math.mjs";

export const answer = double(21);
`,
      "math.mjs": `export const double = value => value * 2;`,
    },
    "entry.mjs",
    "bundle.mjs",
  );
  fs.writeFileSync(
    path.join(esmEntryExport.caseDir, "check.mjs"),
    `import { answer } from "./bundle.mjs";\nconsole.log(answer);\n`,
    "utf8",
  );
  assert.equal(
    execFileSync("node", [path.join(esmEntryExport.caseDir, "check.mjs")], {
      cwd: esmEntryExport.caseDir,
      encoding: "utf8",
    }).trim(),
    "42",
  );

  const commonjsEntryExport = runRoundtrip(
    "commonjs-entry-export",
    {
      "entry.cjs": `
const { double } = require("./math.cjs");

module.exports = { answer: double(21) };
`,
      "math.cjs": `exports.double = value => value * 2;`,
    },
    "entry.cjs",
    "bundle.cjs",
  );
  assert.equal(
    execFileSync("node", [
      "-e",
      "const mod=require(process.argv[1]); console.log(JSON.stringify(mod));",
      commonjsEntryExport.minifiedPath,
    ], {
      cwd: commonjsEntryExport.caseDir,
      encoding: "utf8",
    }).trim(),
    '{"answer":42}',
  );

  const externalImportCollision = runRoundtrip(
    "external-import-collision",
    {
      "entry.mjs": `
import { a } from "./a.mjs";
import { b } from "./b.mjs";

console.log(a(), b());
`,
      "a.mjs": `
import fs from "node:fs";

export function a() {
  return typeof fs.readFileSync;
}
`,
      "b.mjs": `
import fs from "node:path";

export function b() {
  return typeof fs.join;
}
`,
    },
    "entry.mjs",
    "bundle.mjs",
  );
  assert.equal(
    execFileSync("node", [externalImportCollision.minifiedPath], {
      cwd: externalImportCollision.caseDir,
      encoding: "utf8",
    }).trim(),
    "function function",
  );

  console.log("CLI roundtrip and bundle tests passed.");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
