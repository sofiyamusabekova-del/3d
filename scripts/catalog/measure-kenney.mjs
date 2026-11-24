import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'

/** Измеряет исходные модели Kenney (в единицах файла) — нужно, чтобы подобрать масштаб до реальных размеров. */
const dir = 'assets-src/kenney/src/Models/GLTF format'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const want = process.argv.slice(2)
for (const f of (await readdir(dir)).filter((n) => n.endsWith('.glb'))) {
  const id = f.replace('.glb', '')
  if (want.length && !want.includes(id)) continue
  const doc = await io.read(join(dir, f))
  const b = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0])
  const s = [0, 1, 2].map((i) => (b.max[i] - b.min[i]).toFixed(3))
  console.log(`${id}: x ${s[0]} y ${s[1]} z ${s[2]}; текстур ${doc.getRoot().listTextures().length}, материалов ${doc.getRoot().listMaterials().length}`)
}
