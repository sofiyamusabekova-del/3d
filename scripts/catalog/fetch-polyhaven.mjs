import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { POLYHAVEN } from './items.mjs'

/**
 * Скачивает исходные glTF (1k) выбранных моделей Poly Haven в assets-src/polyhaven/<id>/
 * (папка вне public и вне git) и пишет info.json с авторами и габаритами из каталога.
 * Запуск: node scripts/catalog/fetch-polyhaven.mjs [id ...]
 */
const ROOT = 'assets-src/polyhaven'
const only = process.argv.slice(2)

const json = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json()
}

async function save(url, path) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(await r.arrayBuffer()))
  return (await stat(path)).size
}

let total = 0
for (const [id] of POLYHAVEN) {
  if (only.length && !only.includes(id)) continue
  const dir = join(ROOT, id)
  const files = await json(`https://api.polyhaven.com/files/${id}`)
  const info = await json(`https://api.polyhaven.com/info/${id}`)
  const g = files.gltf['1k'].gltf
  let size = await save(g.url, join(dir, `${id}.gltf`))
  for (const [rel, f] of Object.entries(g.include)) size += await save(f.url, join(dir, rel))
  await writeFile(join(dir, 'info.json'), JSON.stringify({
    id, name: info.name, authors: Object.keys(info.authors ?? {}), dimensionsMm: info.dimensions, categories: info.categories,
    url: `https://polyhaven.com/a/${id}`, license: 'CC0 1.0', retrievedAt: new Date().toISOString().slice(0, 10),
  }, null, 2))
  total += size
  console.log(`${id}: ${(size / 1024).toFixed(0)} КБ`)
}
console.log(`Итого: ${(total / 1048576).toFixed(1)} МБ`)
