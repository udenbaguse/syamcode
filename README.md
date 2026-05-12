# syamcode

CLI untuk **minify + reversible identifier obfuscation** (tanpa dependency eksternal).

Untuk ekstensi kode tertentu (terutama JS/TS), syamcode:

1. membuat versi minified
2. mengganti nama identifier dengan token generik (`id1`, `id2`, dst)
3. menulis file kunci: `<outputPath>.syamkey` (JSON mapping)
4. bisa di-restore: `syamcode restore` untuk mengembalikan identifier ke nama asli

> Catatan: Karena **tanpa AST/dependency**, obfuscation/restoration untuk identifier bersifat _best-effort_.

## Cara pakai

### Minify (menghasilkan `.syamkey`)

```bash
npx syamcode <inputPath> <outputPath>
```

Hasil:

- `<outputPath>` (minified)
- `<outputPath>.syamkey` (kunci mapping) untuk file JS/TS/JSX/TSX

### Restore

```bash
npx syamcode restore <minifiedPath> <syamkeyPath> <outputPath>
```

## Contoh

```bash
npx syamcode src/app.js dist/app.min.js
npx syamcode dist/app.min.js dist/app.min.js.syamkey dist/app.restored.js

npx syamcode styles/main.css dist/main.min.css
npx syamcode index.html dist/index.min.html
npx syamcode data/config.json dist/config.min.json
```

## Dukungan ekstensi (best-effort)

- `.js/.ts/.jsx/.tsx`:
  - remove komentar + kompres whitespace (konservatif)
  - obfuscate identifier dengan token generik (`id1`, `id2`, dst)
- `.css`: remove `/* ... */` + kompres whitespace
- `.html/.htm`: remove `<!-- ... -->` + kompres whitespace antar tag
- `.json`: `JSON.parse` lalu `JSON.stringify`
- `.svg`: remove komentar `<!-- ... -->` + kompres whitespace

## Catatan penting

- Restore hanya mengembalikan **nama identifier**, bukan mengembalikan whitespace dan komentar original (karena itu sudah di-minify).
- Tanpa AST, pemetaan variabel/fungsi/struct tidak dibedakan; mapping bersifat generik: `identifier asli -> idN`.
