# Changelog

## v0.1.0 🎉
Initial release of `syamcode`

### Added
- CLI minifier for JS and MJS
- Reversible identifier obfuscation using SHA-256
- `.syamkey` mapping file generation
- `restore` command to recover original identifiers
- Scope-aware Babel AST transformations for safer renaming

### Features
- Remove comments and unnecessary whitespace
- Minify multiple file formats
- Restore original identifier names from minified code