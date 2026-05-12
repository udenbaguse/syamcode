## TODO - syamcode reversible minify + restore

- [ ] Update `bin/syamcode.js`:
  - [ ] Support commands:
    - `npx syamcode <inputPath> <outputPath>` => minify + reversible identifier obfuscation + write `<outputPath>.syamkey`
    - `npx syamcode restore <minifiedPath> <keyPath> <outputPath>` => restore identifiers using `.syamkey`
  - [ ] Implement identifier mapping (no dependency/AST):
    - [ ] Parse code with state machine (strings/comments preserved)
    - [ ] Replace identifiers (best-effort) with generic tokens `id1`, `id2`, ...
  - [ ] Implement restore (reverse mapping) while preserving current minified formatting
- [ ] Update `README.md` with new CLI usage + limitations
- [ ] Add tests:
  - [ ] `test/sample.js`
  - [ ] Run CLI locally: minify => restore
  - [ ] Create/verify outputs files exist
