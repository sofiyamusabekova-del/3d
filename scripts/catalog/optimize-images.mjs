// Этап 28: лёгкие картинки для интерфейса.
//  - превью предметов: preview.png -> preview.webp (PNG остаётся только исходником и удаляется флагом --prune);
//  - миниатюры обоев: <id>_thumb.webp 96x96 вместо загрузки полной текстуры 1k ради квадрата 44 px.
// Запуск: node scripts/catalog/optimize-images.mjs [--prune]
import { readdirSync, existsSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const prune = process.argv.includes('--prune')
let before = 0, after = 0

const catalog = 'public/catalog'
for (const id of readdirSync(catalog)) {
  const png = join(catalog, id, 'preview.png')
  if (!existsSync(png)) continue
  const out = join(catalog, id, 'preview.webp')
  await sharp(png).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(out)
  before += statSync(png).size
  after += statSync(out).size
  if (prune) unlinkSync(png)
}

const wall = 'public/textures/wallpaper'
for (const id of readdirSync(wall)) {
  const src = join(wall, id, `${id}_diff_1k.webp`)
  if (!existsSync(src)) continue
  const out = join(wall, id, `${id}_thumb.webp`)
  await sharp(src).resize(96, 96, { fit: 'cover' }).webp({ quality: 80 }).toFile(out)
  console.log(`thumb ${id}: ${statSync(out).size} B`)
}
console.log(`previews: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`)
