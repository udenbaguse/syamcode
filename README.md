# syamcode

CLI for **minify + reversible identifier obfuscation** that can be restored using a key file named `.syamkey`.

[![License](https://img.shields.io/badge/license-proprietary-blue.svg)](LICENSE)

## License

This software is proprietary. By using SyamCode, you agree to the [End-User License Agreement (EULA)](LICENSE).

For selected code extensions (especially JS/TS), `syamcode`:

1. produces a minified version
2. replaces identifier names with hash SHA-256
3. writes a key file: `<outputPath>.syamkey` (JSON mapping)
4. can restore identifiers back to the original names using `syamcode restore`

## Usage

### Minify (generates `.syamkey`)

```bash
npx @udenbaguse/syamcode <inputPath> <outputPath>
```

Outputs:

- `<outputPath>`: minified code
- `<outputPath>.syamkey`: mapping for JS/MJS

### Restore

```bash
npx @udenbaguse/syamcode restore <minifiedPath> <syamkeyPath> <outputPath>
```

## Examples

```bash
npx @udenbaguse/syamcode src/app.js dist/app.min.js
npx @udenbaguse/syamcode restore dist/app.min.js dist/app.min.js.syamkey dist/app.restored.js

npx @udenbaguse/syamcode src/app.mjs dist/app.min.mjs
npx @udenbaguse/syamcode restore dist/app.min.mjs dist/app.min.mjs.syamkey dist/app.restored.mjs
```

## Supported extensions

- `.js` and `.mjs`:
  - parse using **Babel AST**
  - remove comments + compress whitespace
  - generate `.syamkey` mapping: `originalIdentifier -> hash SHA-256`

## Important notes

- Restore returns the **identifier names** (after reversing the rename), not the original whitespace/comments.
- For JS/MJS, restoration correctness is improved by using **scope-aware** Babel AST transformations.
