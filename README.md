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

npx syamcode styles/main.css dist/main.min.css
npx syamcode index.html dist/index.min.html
npx syamcode data/config.json dist/config.min.json
```

## Extension support (best-effort)

- `.js/.ts/.jsx/.tsx`:
  - parse using **Babel AST**
  - remove comments + compress whitespace + rename bindings in a **scope-aware** manner
  - generate `.syamkey` mapping: `originalIdentifier -> idN`
- `.css`: remove `/* ... */` + compress whitespace
- `.html/.htm`: remove `<!-- ... -->` + compress whitespace between tags
- `.json`: `JSON.parse` then `JSON.stringify`
- `.svg`: remove `<!-- ... -->` + compress whitespace

## Important notes

- Restore returns the **identifier names** (after reversing the rename), not the original whitespace/comments.
- For JS/TS/JSX/TSX, restoration correctness is improved by using **scope-aware** Babel AST transformations.
