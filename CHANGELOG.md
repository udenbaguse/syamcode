# Changelog

## 0.1.0 (Initial)

- Initial release of **syamcode** CLI for _minify + reversible identifier obfuscation_.
- Supports:
  - `npx syamcode <inputPath> <outputPath>` to generate `<outputPath>` and `<outputPath>.syamkey`
  - `npx syamcode restore <minifiedPath> <syamkeyPath> <outputPath>` to restore identifiers
