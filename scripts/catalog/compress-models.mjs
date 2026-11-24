// Этап 28: сжатие геометрии каталога (EXT_meshopt_compression + KHR_mesh_quantization).
// Запускается после build-models.mjs; повторный запуск безопасен (уже сжатые файлы пропускаются, если не стали меньше).
// Загрузчик сцены (drei useGLTF) включает декодер meshopt по умолчанию. Запуск: node scripts/catalog/compress-models.mjs
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, quantize } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

let before = 0, after = 0, changed = 0
const root = 'public/catalog'
for (const id of readdirSync(root)) {
  const file = join(root, id, `${id}.glb`)
  if (!existsSync(file)) continue
  const size0 = statSync(file).size
  const doc = await io.read(file)
  await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  const out = await io.writeBinary(doc)
  before += size0
  if (out.byteLength < size0 * 0.97) {
    await io.write(file, doc)
    after += out.byteLength
    changed++
  } else after += size0
}
// Манифест хранит вес файла (его сверяет тест и отчёт ASSETS.md): после сжатия он берётся с диска.
const manifestPath = 'src/catalog/catalog.generated.json'
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
for (const [id, g] of Object.entries(manifest.items)) {
  const file = join(root, id, `${id}.glb`)
  if (existsSync(file)) g.glbBytes = statSync(file).size
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`models: ${changed} changed; ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`)
