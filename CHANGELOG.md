# Changelog

## Version 2.0. (2026-05-14)
### Fixed
- Remove TS for fix bug

## Version 2.0.2 (2026-05-14)
### Updated
- Updated README and LICENSE with correct package name and site URL.
- Updated EULA with new attribution requirements and usage terms.

## Version 2.0.1 (2026-05-14)
### Fixed
- fixed restore command to correctly handle

## Version 2.0.0 (2026-05-14)

### Added
- Remove comments and unnecessary whitespace

### Fixed
- Restore original identifier names from minified code using the .syamkey version 2.
- Scope-aware Babel AST transformations for safer renaming

## Version 1.0.0 (2026-05-13)

### Added
- `.syamkey` mapping file generation

### Changed
- Reversible identifier obfuscation using SHA-256 (Syamkey version 2).

### Fixed
- `restore` command to recover original identifiers

## Version 0.1.0 (2026-05-12)
Initial release with basic minification and obfuscation features

### Features
- CLI minifier for JS
- replace identifier names with Syamkey version 1 (generic id1, id2, etc).
- Restore original identifier names from minified code