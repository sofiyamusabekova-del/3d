import { existsSync, readFileSync, statSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG, CATALOG_ITEMS, categoriesOf, itemsForRoom } from '../../src/catalog/catalog'
import { roomClearPolygon } from '../../src/domain/derive'
import { validatePlacement } from '../../src/domain/placement'
import type { Apartment, RoomType } from '../../src/domain/types'
import { buildApartment, templateById } from '../../src/scenario/layouts'

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const glb = (id: string) => `public/catalog/${id}/${id}.glb`

/** Минимум предметов на тип помещения (SPEC D-07: примерно 5–7). */
const MIN_PER_ROOM = 5
const ROOM_TYPES: RoomType[] = ['living', 'bedroom', 'kitchen', 'bathroom', 'toilet', 'hallway']

describe('13.2 габариты, оси и опора по самой модели', () => {
  const bounds = new Map<string, { size: number[]; min: number[]; max: number[] }>()
  beforeAll(async () => {
    for (const it of CATALOG_ITEMS) {
      const doc = await io.read(glb(it.id))
      const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
      const b = getBounds(scene)
      bounds.set(it.id, { size: [0, 1, 2].map((i) => (b.max[i] - b.min[i]) * 100), min: b.min, max: b.max })
    }
  })

  it('карточка совпадает с измеренным габаритом модели с допуском 0,1 см (Ш × Г × В)', () => {
    for (const it of CATALOG_ITEMS) {
      const s = bounds.get(it.id)!.size
      expect(Math.abs(it.widthCm - s[0]), `${it.id} ширина`).toBeLessThanOrEqual(0.1)
      expect(Math.abs(it.heightCm - s[1]), `${it.id} высота`).toBeLessThanOrEqual(0.1)
      expect(Math.abs(it.depthCm - s[2]), `${it.id} глубина`).toBeLessThanOrEqual(0.1)
    }
  })

  it('начало координат — центр основания: пол на y = 0, габарит симметричен по x и z', () => {
    for (const it of CATALOG_ITEMS) {
      const b = bounds.get(it.id)!
      expect(Math.abs(b.min[1]), it.id).toBeLessThan(0.001)
      expect(Math.abs((b.max[0] + b.min[0]) / 2), it.id).toBeLessThan(0.001)
      expect(Math.abs((b.max[2] + b.min[2]) / 2), it.id).toBeLessThan(0.001)
    }
  })

  it('размеры правдоподобны для мебели и малых предметов (5–300 см; настенные плоские предметы тоньше 5 см, но не тоньше 2 см)', () => {
    for (const it of CATALOG_ITEMS) {
      // Глубина настенного предмета — толщина рамы или панели: телевизор 3,6 см, картина 2,6 см.
      const thin = it.mount === 'wall' && it.depthCm <= 5
      for (const v of thin ? [it.widthCm, it.heightCm] : [it.widthCm, it.depthCm, it.heightCm]) expect(v, it.id).toBeGreaterThan(5)
      if (thin) expect(it.depthCm, it.id).toBeGreaterThanOrEqual(2)
    }
    for (const it of CATALOG_ITEMS) for (const v of [it.widthCm, it.depthCm]) expect(v, it.id).toBeLessThan(300)
  })
})

describe('13.3 вес файлов и сохранение внешнего вида', () => {
  it('каждый GLB самодостаточен, без анимаций, текстуры не больше 1024 px; вес разумный', async () => {
    let total = 0
    for (const it of CATALOG_ITEMS) {
      const bytes = statSync(glb(it.id)).size
      total += bytes
      expect(bytes, `${it.id} вес`).toBeLessThan(3 * 1024 * 1024)
      const doc = await io.read(glb(it.id))
      expect(doc.getRoot().listAnimations(), it.id).toHaveLength(0)
      for (const t of doc.getRoot().listTextures()) {
        const [w, h] = t.getSize() ?? [0, 0]
        expect(Math.max(w, h), `${it.id} текстура`).toBeLessThanOrEqual(1024)
      }
      const meshes = doc.getRoot().listMeshes()
      expect(meshes.length, it.id).toBeGreaterThan(0)
    }
    expect(total / 1048576, 'общий вес GLB, МБ').toBeLessThan(30)
  })

  it('манифест хранит вес до и после и не показывает роста', () => {
    const m = JSON.parse(readFileSync('src/catalog/catalog.generated.json', 'utf8')).items as Record<string, { srcBytes: number; glbBytes: number; minPsnrDb: number }>
    for (const it of CATALOG_ITEMS) {
      const g = m[it.id]
      expect(g.glbBytes, it.id).toBeLessThanOrEqual(g.srcBytes)
      expect(g.minPsnrDb, `${it.id}: PSNR до и после сжатия`).toBeGreaterThanOrEqual(35)
      expect(statSync(glb(it.id)).size).toBe(g.glbBytes)
    }
  })
})

describe('13.4 коллайдеры и способ установки', () => {
  it('коллайдер — объём по габариту модели в локальных осях, предмет стоит на полу (D-05)', () => {
    for (const it of CATALOG_ITEMS) {
      expect(['floor', 'surface', 'wall', 'ceiling'], it.id).toContain(it.mount) // surface — на опору, wall — на стену, ceiling — от потолка
      expect(it.colliders).toHaveLength(1)
      const c = it.colliders[0]
      expect(c.widthCm).toBeCloseTo(it.widthCm, 6)
      expect(c.depthCm).toBeCloseTo(it.depthCm, 6)
      expect(c.yMinCm).toBe(0)
      expect(c.yMaxCm).toBeCloseTo(it.heightCm, 6)
    }
  })

  it('по правилам D-05 каждый предмет допустимо ставится в большую комнату и отклоняется за её стеной', () => {
    const a: Apartment = buildApartment(templateById('3v')!)
    const big = Object.values(a.rooms).map((r) => ({ r, poly: roomClearPolygon(a, r) })).map((x) => {
      const xs = x.poly.map((p) => p.x), zs = x.poly.map((p) => p.z)
      return { ...x, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cz: (Math.max(...zs) + Math.min(...zs)) / 2 }
    }).sort((p, q) => q.w * q.d - p.w * p.d)[0]
    for (const it of CATALOG_ITEMS) {
      const cand = { id: null, catalogItemId: it.id, roomId: big.r.id, xCm: big.cx, zCm: big.cz, angleDeg: 0 }
      // Настольным предметам нужна опора (см. surface-placement.test.ts): на пустом полу они не ставятся.
      if (it.mount === 'floor' && it.widthCm < big.w - 80 && it.depthCm < big.d - 80) expect(validatePlacement(a, CATALOG, cand).valid, it.id).toBe(true)
      expect(validatePlacement(a, CATALOG, { ...cand, xCm: big.cx + big.w }).valid, `${it.id} за стеной`).toBe(false)
    }
  })
})

describe('13.1 реестр источников и лицензий', () => {
  it('у каждого предмета есть источник, автор, лицензия и дата; CC0 — Poly Haven и Kenney, FurniMesh — по D-29', () => {
    for (const it of CATALOG_ITEMS) {
      const own = it.id.startsWith('own_') // собственные модели проекта (этап 21): источник — скрипт генерации
      expect(it.license.source, it.id).toMatch(own ? /^scripts\/catalog\/make-lights\.mjs/ : /^https:\/\/(polyhaven\.com|kenney\.nl|furnimesh\.com\/library)\//)
      expect(it.license.author.length, it.id).toBeGreaterThan(0)
      expect(it.license.retrievedAt, it.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (it.license.source.startsWith('https://furnimesh.com/')) {
        // Не CC0: условия сайта записаны как есть, а не выдаются за CC0 (D-29).
        expect(it.license.license, it.id).toMatch(/FurniMesh.*не CC0/)
        expect(it.license.attribution, it.id).toMatch(/FurniMesh/)
        expect(it.id).toMatch(/^fm_/)
      } else if (own) {
        expect(it.license.license, it.id).toMatch(/Собственная/)
      } else {
        expect(it.license.license, it.id).toMatch(/CC0/)
      }
    }
  })

  it('все предметы записаны в docs/ASSETS.md', () => {
    const text = readFileSync('docs/ASSETS.md', 'utf8')
    for (const it of CATALOG_ITEMS) expect(text.includes(`| ${it.id} |`) || text.includes(`\`${it.id}\``), `${it.id} отсутствует в ASSETS.md`).toBe(true)
  })

  it('идентификаторы уникальны, версия ассета задана', () => {
    expect(new Set(CATALOG_ITEMS.map((i) => i.id)).size).toBe(CATALOG_ITEMS.length)
    for (const it of CATALOG_ITEMS) expect(it.version.length).toBeGreaterThan(0)
  })
})

describe('13.5 карточки, превью, категории, фильтр по помещениям', () => {
  it('у каждого предмета есть название, категория, превью-файл', () => {
    for (const it of CATALOG_ITEMS) {
      expect(it.name.length, it.id).toBeGreaterThan(0)
      expect(it.category.length, it.id).toBeGreaterThan(0)
      expect(existsSync(`public${it.previewUrl}`), `${it.id}: превью`).toBe(true)
    }
  })

  it(`для каждого из шести типов помещений не меньше ${MIN_PER_ROOM} предметов`, () => {
    for (const type of ROOM_TYPES) expect(itemsForRoom(type).length, type).toBeGreaterThanOrEqual(MIN_PER_ROOM)
  })

  it('нужные предметы находятся в соответствующих комнатах, чужие не предлагаются', () => {
    const names = (t: RoomType) => itemsForRoom(t).map((i) => i.id)
    expect(names('bedroom')).toContain('painted_wooden_nightstand')
    expect(names('bedroom')).not.toContain('sofa_02')
    expect(names('living')).toContain('sofa_02')
    expect(names('kitchen')).toContain('dining_chair_02')
    expect(names('kitchen')).not.toContain('ArmChair_01')
    expect(names('hallway')).toContain('ClassicConsole_01')
    // Составные типы: кухня-гостиная получает предметы обеих комнат, совмещённый санузел — ванной и туалета.
    for (const id of names('living')) expect(names('kitchenLiving')).toContain(id)
    for (const id of names('kitchen')) expect(names('kitchenLiving')).toContain(id)
    for (const id of names('bathroom')) expect(names('combinedBathroom')).toContain(id)
    for (const id of names('toilet')) expect(names('combinedBathroom')).toContain(id)
  })

  it('категории собираются из предметов и не пусты', () => {
    const cats = categoriesOf(CATALOG_ITEMS)
    expect(cats.length).toBeGreaterThanOrEqual(4)
    expect(cats).toContain('Хранение')
  })
})
