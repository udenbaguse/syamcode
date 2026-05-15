import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "bin", "syamcode-syamkey-v3.js");
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

  console.log("CLI roundtrip and bundle tests passed.");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
