# syamcode

CLI for **minify + reversible identifier obfuscation** that can be restored using a key file named `.syamkey`.

For selected code extensions (especially JS/TS), `syamcode`:

1. produces a minified version
2. replaces identifier names with hash SHA-256
3. writes a key file: `<outputPath>.syamkey` (JSON mapping)
4. can restore identifiers back to the original names using `syamcode restore`

## Usage

### Minify (generates `.syamkey`)

```bash
npx syamcode <inputPath> <outputPath>
```

Outputs:

- `<outputPath>`: minified code
- `<outputPath>.syamkey`: mapping for JS/TS/JSX/TSX

### Restore

```bash
npx syamcode restore <minifiedPath> <syamkeyPath> <outputPath>
```

## Examples

```bash
npx syamcode src/app.js dist/app.min.js
npx syamcode dist/app.min.js dist/app.min.js.syamkey dist/app.restored.js

npx syamcode src/app.mjs dist/app.min.mjs
npx syamcode dist/app.min.mjs dist/app.min.mjs.syamkey dist/app.restored.mjs
```

## Supported extensions

- `.js` and `.mjs`:
  - parse using **Babel AST**
  - remove comments + compress whitespace
  - generate `.syamkey` mapping: `originalIdentifier -> idN`

## Important notes

- Restore returns the **identifier names** (after reversing the rename), not the original whitespace/comments.
- For JS/TS/JSX/TSX, restoration correctness is improved by using **scope-aware** Babel AST transformations.
