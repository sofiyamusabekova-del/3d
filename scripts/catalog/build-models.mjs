import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { center, dedup, getBounds, prune, simplify, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { FURNIMESH, KENNEY, OWN, POLYHAVEN, ROOM_GROUPS } from './items.mjs'

/**
 * Подготовка моделей (SPEC §12, задачи 13.2–13.3), замена Blender: исходный glTF/GLB → нормализованный GLB.
 *  1. (Kenney) масштаб до реальных размеров по перечню items.mjs;
 *  2. начало координат — центр основания (x, z по центру габарита, y = пол);
 *  3. габариты измеряются в см по итоговой геометрии (не берутся «с карточки»);
 *  4. анимации убираются, дедупликация, удаление неиспользуемого, текстуры в WebP до 1024 px;
 *  5. сравнение «до и после»: PSNR каждой текстуры цвета; вес файлов до и после.
 * Результат: public/catalog/<id>/<id>.glb и src/catalog/catalog.generated.json.
 * Запуск: node scripts/catalog/build-models.mjs [id ...]   (id у Kenney — kenney_<файл>)
 */
const PH_SRC = 'assets-src/polyhaven'
const KN_SRC = 'assets-src/kenney/src/Models/GLTF format'
const FM_SRC = 'assets-src/furnimesh'
const FM_DATE = '2026-11-16'
/** Целевое число треугольников после упрощения моделей FurniMesh (исходники ~290 тыс.). */
const FM_TRIANGLES = 20000
const OUT = 'public/catalog'
const MANIFEST = 'src/catalog/catalog.generated.json'
const only = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const MIN_PSNR_DB = 35
const KENNEY_DATE = '2026-11-15'

const dirSize = async (dir) => {
  let n = 0
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) if (e.isFile() && !e.name.endsWith('.json')) n += (await stat(join(e.parentPath, e.name))).size
  return n
}

/** PSNR двух изображений по каналам RGB, дБ. */
async function psnr(a, b) {
  const meta = await sharp(a).metadata()
  const ra = await sharp(a).removeAlpha().raw().toBuffer()
  const rb = await sharp(b).removeAlpha().resize(meta.width, meta.height).raw().toBuffer()
  let se = 0
  for (let i = 0; i < ra.length; i++) { const d = ra[i] - rb[i]; se += d * d }
  const mse = se / ra.length
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse)
}

/** Группы помещений из перечня → типы помещений модели. */
const expandRooms = (groups) => [...new Set(groups.flatMap((g) => ROOM_GROUPS[g]))]

/**
 * Масштаб Kenney по перечню: оси модели x = ширина, y = высота, z = глубина. Одно значение — равномерный
 * масштаб, три — осевой (только для предметов без поворотов узлов, иначе получился бы перекос).
 */
function kenneyScale(doc, spec, id) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const b = getBounds(scene)
  const raw = { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], d: b.max[2] - b.min[2] }
  const keys = Object.keys(spec)
  const s = keys.length === 1 ? Array(3).fill((spec[keys[0]] / 100) / raw[keys[0]]) : [spec.w / 100 / raw.w, spec.h / 100 / raw.h, spec.d / 100 / raw.d]
  const uniform = keys.length === 1
  for (const node of scene.listChildren()) {
    const r = node.getRotation()
    if (!uniform && (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) > 1e-6)) throw new Error(`${id}: осевой масштаб запрещён для повёрнутого узла`)
    node.setScale(node.getScale().map((v, i) => v * s[i]))
    node.setTranslation(node.getTranslation().map((v, i) => v * s[i]))
  }
  return { scale: s, raw }
}

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{"items":{}}'))
let outTotal = 0

const jobs = [
  ...POLYHAVEN.map(([id, name, category, groups]) => ({ kind: 'polyhaven', id, name, category, groups })),
  // mount в перечне — способ установки (по умолчанию floor); из масштаба он исключается.
  ...KENNEY.map(([file, name, category, groups, { mount, ...spec }]) => ({ kind: 'kenney', id: `kenney_${file}`, file, name, category, groups, spec, mount })),
  ...FURNIMESH.map(([id, name, category, groups, { mount, ...spec }, page]) => ({ kind: 'furnimesh', id, name, category, groups, spec, page, mount })),
  // Собственные модели (make-lights.mjs): сразу в реальных размерах.
  ...OWN.map(([id, name, category, groups, mount]) => ({ kind: 'own', id, name, category, groups, mount })),
]

const triangles = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0)
await MeshoptSimplifier.ready

for (const job of jobs) {
  if (only.length && !only.includes(job.id)) continue
  const { id } = job
  let doc, srcBytes, info, scaleInfo = null
  if (job.kind === 'polyhaven') {
    const dir = join(PH_SRC, id)
    doc = await io.read(join(dir, `${id}.gltf`))
    srcBytes = await dirSize(dir)
    info = JSON.parse(await readFile(join(dir, 'info.json'), 'utf8'))
  } else if (job.kind === 'furnimesh') {
    const file = join(FM_SRC, id, 'source.glb')
    doc = await io.read(file)
    srcBytes = (await stat(file)).size
    info = {
      url: `https://furnimesh.com/library/${job.page}/`, authors: ['FurniMesh (ИИ-генерация по фото пользователя, автор не указан)'],
      license: 'FurniMesh: бесплатно, коммерческое использование (не CC0)', attribution: 'Не требуется (по заявлению FurniMesh)', retrievedAt: FM_DATE,
    }
    // Перед модели должен смотреть на +Z (как у остальных); у части моделей FurniMesh он повёрнут — rot в перечне, градусы.
    const { rot = 0, err = 0.01, q = 85, weldTol = 0, ...size } = job.spec // q — качество WebP; weldTol — допуск склейки вершин (у травы и плетения помогает упрощению)
    job.simplifyError = err
    job.weldTol = weldTol
    job.webpQuality = q
    if (rot) {
      const q = [0, Math.sin((rot * Math.PI) / 360), 0, Math.cos((rot * Math.PI) / 360)]
      const sc = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
      for (const node of sc.listChildren()) {
        const wrap = doc.createNode(`rot_${rot}`).setRotation(q).addChild(node)
        sc.removeChild(node); sc.addChild(wrap)
      }
    }
    scaleInfo = kenneyScale(doc, size, id)
    if (rot) scaleInfo.rotationDeg = rot
  } else if (job.kind === 'own') {
    const file = join('assets-src/own', `${id}.glb`)
    doc = await io.read(file)
    srcBytes = (await stat(file)).size
    info = { url: 'scripts/catalog/make-lights.mjs (собственная модель проекта)', authors: ['Проект (собственная модель)'], license: 'Собственная работа проекта', attribution: 'Не требуется', retrievedAt: '2026-11-19' }
    scaleInfo = { scale: [1, 1, 1], raw: { w: 0, h: 0, d: 0 } }
  } else {
    const file = join(KN_SRC, `${job.file}.glb`)
    doc = await io.read(file)
    srcBytes = (await stat(file)).size
    info = { url: 'https://kenney.nl/assets/furniture-kit', authors: ['Kenney'], license: 'CC0 1.0', retrievedAt: KENNEY_DATE }
    scaleInfo = kenneyScale(doc, job.spec, id)
  }
  // Исходные текстуры цвета для сравнения (до сжатия).
  const before = new Map()
  for (const t of doc.getRoot().listTextures()) before.set(t.getName() || t.getURI(), { data: Buffer.from(t.getImage()) })
  // У FurniMesh текстуры без имён: сравниваем текстуры цвета по материалам.
  const baseBefore = doc.getRoot().listMaterials().map((m) => m.getBaseColorTexture()?.getImage()).map((img) => img && Buffer.from(img))
  const trisBefore = triangles(doc)
  if (job.kind === 'furnimesh') {
    // Материал непрозрачный, а у части текстур есть альфа-канал (пустые поля атласа с нулевой прозрачностью): WebP с альфой
    // портит цвет под нулевой альфой. Альфа не нужна — убираем до сжатия.
    for (const m of doc.getRoot().listMaterials()) {
      const t = m.getBaseColorTexture()
      if (t && m.getAlphaMode() === 'OPAQUE' && t.getMimeType() === 'image/png' && (await sharp(Buffer.from(t.getImage())).metadata()).hasAlpha) t.setImage(await sharp(Buffer.from(t.getImage())).removeAlpha().png().toBuffer())
    }
    await doc.transform(weld(job.weldTol ? { tolerance: job.weldTol } : {}), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, FM_TRIANGLES / trisBefore), error: job.simplifyError }))
  }

  await doc.transform(
    // Анимации (например, открывание дверок у шкафа) в редакторе не используются: убираем, чтобы не везти лишний вес.
    (d) => { for (const a of d.getRoot().listAnimations()) a.dispose() },
    center({ pivot: 'below' }),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: job.webpQuality ?? 85 }),
  )
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const b = getBounds(scene)
  const size = [0, 1, 2].map((i) => (b.max[i] - b.min[i]) * 100) // м → см
  const centre = [(b.max[0] + b.min[0]) / 2, (b.max[2] + b.min[2]) / 2]
  if (Math.abs(b.min[1]) > 0.001 || Math.abs(centre[0]) > 0.001 || Math.abs(centre[1]) > 0.001) throw new Error(`${id}: начало координат не в центре основания`)

  // «До и после»: PSNR по текстурам цвета (у моделей без текстур сравнивать нечего).
  let worst = 99
  for (const t of doc.getRoot().listTextures()) {
    const name = t.getName() || t.getURI()
    const src = before.get(name)
    if (!src || !/diff/i.test(name)) continue
    worst = Math.min(worst, await psnr(src.data, Buffer.from(t.getImage())))
  }
  if (job.kind === 'furnimesh') {
    const mats = doc.getRoot().listMaterials()
    for (let i = 0; i < mats.length; i++) {
      const img = mats[i].getBaseColorTexture()?.getImage()
      // Исходник 2048 px: уменьшение до 1024 px задано бюджетом каталога, поэтому сравниваем с исходником того же
      // размера — PSNR показывает потери сжатия WebP, а не уменьшения (иначе ~31 дБ при неизменном виде в комнате).
      if (img && baseBefore[i]) worst = Math.min(worst, await psnr(Buffer.from(img), baseBefore[i]))
    }
  }
  if (worst < MIN_PSNR_DB) throw new Error(`${id}: внешний вид изменился (PSNR ${worst.toFixed(1)} дБ < ${MIN_PSNR_DB})`)

  await mkdir(join(OUT, id), { recursive: true })
  const path = join(OUT, id, `${id}.glb`)
  await io.write(path, doc)
  const outBytes = (await stat(path)).size
  outTotal += outBytes
  manifest.items[id] = {
    name: job.name, category: job.category, roomTypes: expandRooms(job.groups), mount: job.mount ?? 'floor',
    source: job.kind, url: info.url, authors: info.authors, license: info.license, retrievedAt: info.retrievedAt,
    ...(info.attribution ? { attribution: info.attribution } : {}),
    widthCm: +size[0].toFixed(1), depthCm: +size[2].toFixed(1), heightCm: +size[1].toFixed(1),
    ...(job.kind === 'polyhaven' ? { catalogDimensionsCm: info.dimensionsMm.map((v) => +(v / 10).toFixed(1)) } : {
      scale: scaleInfo.scale.map((v) => +v.toFixed(3)), sourceFile: job.kind === 'kenney' ? `${job.file}.glb` : job.kind === 'own' ? `own/${id}.glb` : `${id}/source.glb`,
      ...(job.kind === 'own' ? {} : { rawSizeCm: [scaleInfo.raw.w, scaleInfo.raw.h, scaleInfo.raw.d].map((v) => +(v * 100).toFixed(1)) }),
    }),
    srcBytes: job.kind === 'own' ? outBytes : srcBytes, glbBytes: outBytes, minPsnrDb: +worst.toFixed(1), // у собственных моделей сжатия нет: вес до равен весу после
    ...(job.kind === 'furnimesh' ? { trianglesBefore: trisBefore, trianglesAfter: triangles(doc), ...(scaleInfo.rotationDeg ? { rotationDeg: scaleInfo.rotationDeg } : {}) } : {}),
  }
  console.log(`${id}: ${size[0].toFixed(1)} × ${size[2].toFixed(1)} × ${size[1].toFixed(1)} см (Ш×Г×В); ${(srcBytes / 1024).toFixed(0)} → ${(outBytes / 1024).toFixed(0)} КБ; PSNR ${worst.toFixed(1)} дБ; треугольников ${trisBefore} → ${triangles(doc)}`)
}
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2))
console.log(`GLB всего: ${(outTotal / 1048576).toFixed(1)} МБ`)
