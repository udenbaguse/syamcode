# SY⭐MC0D3 (Syamcode Syamkey-V3)

CLI for **minify + reversible identifier obfuscation** that can be restored using a key file named `.syamkey`.

[![License](https://img.shields.io/badge/license-proprietary-blue.svg)](LICENSE)


## License 

This software is proprietary. By using SyamCode, you agree to the [End-User License Agreement (EULA)](LICENSE).

### - SyamCode as DevDependencies 
for your project's minify/build process, please credit it in the format:

```
Minify process using SyamCode by Muhamad Syamsudin (@udenbaguse) – https://www.npmjs.com/package/@udenbaguse/syamcode
```


### - SyamCode is Used as Part of Dependencies(not devDependencies)
 it means that the Software is an essential part of your application's functionality. You MUST include credit in the format:
```
This application uses SyamCode by Muhamad Syamsudin (@udenbaguse) – https://www.npmjs.com/package/@udenbaguse/syamcode' 
```
in your Project's Documentation or README.

### If You Only Use `npx...`
for one-time task -> ***No Attribution*** Needed!
Feel free to use it for quick minify/restore jobs.

## Features
For selected code extensions (JS/MJS/CJS), `syamcode`:

1. produces a minified version
2. detects local `import` / `require` dependencies
3. bundles local files into one output file
4. replaces identifier names with hash SHA-256
5. writes a key file: `<outputPath>.syamkey` (JSON mapping)
6. can restore identifiers back to the original names using `syamcode restore`

## Usage

### Minify (generates `.syamkey`)

```bash
npx @udenbaguse/syamcode@latest <inputPath> <outputPath>
```

Outputs:

- `<outputPath>`: minified code
- `<outputPath>.syamkey`: mapping for JS/MJS/CJS

### Restore

```bash
npx @udenbaguse/syamcode@latest restore <minifiedPath> <syamkeyPath> <outputPath>
```

## Examples

```bash
npx @udenbaguse/syamcode@latest src/app.js dist/app.min.js
npx @udenbaguse/syamcode@latest restore dist/app.min.js dist/app.min.js.syamkey dist/app.restored.js

npx @udenbaguse/syamcode@latest src/app.mjs dist/app.min.mjs
npx @udenbaguse/syamcode@latest restore dist/app.min.mjs dist/app.min.mjs.syamkey dist/app.restored.mjs
```

## Supported extensions

- `.js`, `.mjs`, and `.cjs`:
  - parse using **Babel AST**
  - bundle local relative dependencies from `import` / `require`
  - remove comments + compress whitespace
  - generate `.syamkey` mapping: `originalIdentifier -> hash SHA-256`

## Important notes

- Restore returns the **identifier names** (after reversing the rename), not the original whitespace/comments.
- Bundling only resolves local relative dependencies such as `./helper.js` or `../lib/index.js`. Package imports and Node built-ins such as `fs` remain external dependencies.
- For JS/MJS/CJS, restoration correctness is improved by using **scope-aware** Babel AST transformations.
- If installing then it will use npm run, the command will change from npx to npm like: 
  - **npx @udenbaguse/syamcode@latest** [inputPath] [outputPath] *becomes* **npm run syamcode** [inputPath] [outputPath]
  - **npx @udenbaguse/syamcode@latest restore** [minifiedPath] [syamkeyPath] [outputPath] *becomes* **npm run syamcode -- restore** [minifiedPath] [syamkeyPath] [outputPath]
