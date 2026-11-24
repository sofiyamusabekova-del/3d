import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
const wall = 'public/textures/wallpaper'
let a=0,b=0
for (const id of readdirSync(wall)) for (const n of ['diff','nor_gl']) {
  const jpg = join(wall,id,`${id}_${n}_1k.jpg`); if (!existsSync(jpg)) continue
  const out = join(wall,id,`${id}_${n}_1k.webp`)
  await sharp(jpg).webp({ quality: n==='diff'?85:92, effort: 5 }).toFile(out)
  a+=statSync(jpg).size; b+=statSync(out).size; unlinkSync(jpg)
}
console.log((a/1024|0)+' KB -> '+(b/1024|0)+' KB')
