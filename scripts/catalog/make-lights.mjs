import { mkdir } from 'node:fs/promises'
import { Document, NodeIO } from '@gltf-transform/core'
import { normals } from '@gltf-transform/functions'

/**
 * Собственные простые модели люстр (этап 21, SPEC D-11, D-14): строятся кодом, ничего не скачивается.
 * Единицы — метры, ось Y вверх; у потолочного предмета «основание» — нижняя точка, цепь уходит вверх.
 * Результат: assets-src/own/<id>.glb; дальше их обрабатывает build-models.mjs наравне с остальными.
 * Запуск: node scripts/catalog/make-lights.mjs
 */

/** Накопитель геометрии одного материала. */
class Mesh {
  pos = []
  idx = []
  vertex(x, y, z) { this.pos.push(x, y, z); return this.pos.length / 3 - 1 }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d) }

  /** Параллелепипед по углам (x0,y0,z0)–(x1,y1,z1); грани обходятся против часовой стрелки снаружи. */
  box(x0, y0, z0, x1, y1, z1) {
    const q = (...p) => this.quad(...p.map((v) => this.vertex(...v)))
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0])
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1])
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
    q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0])
    q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1])
  }

  /** Цилиндр или усечённый конус вдоль отрезка p0→p1. */
  tube(p0, p1, r0, r1 = r0, seg = 12) {
    const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
    const len = Math.hypot(...ax)
    const w = ax.map((v) => v / len)
    const helper = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = norm(cross(w, helper))
    const v = cross(w, u)
    const ring = (p, r) => Array.from({ length: seg }, (_, i) => {
      const t = (i / seg) * Math.PI * 2
      return this.vertex(p[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * r, p[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * r, p[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * r)
    })
    const a = ring(p0, r0), b = ring(p1, r1)
    for (let i = 0; i < seg; i++) this.quad(a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i])
    // Торцы.
    const ca = this.vertex(...p0), cb = this.vertex(...p1)
    for (let i = 0; i < seg; i++) { this.idx.push(ca, a[(i + 1) % seg], a[i]); this.idx.push(cb, b[i], b[(i + 1) % seg]) }
  }

  sphere(c, rx, ry = rx, rz = rx, seg = 16, rings = 10) {
    const grid = []
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI
      const row = []
      for (let i = 0; i < seg; i++) {
        const t = (i / seg) * Math.PI * 2
        row.push(this.vertex(c[0] + rx * Math.sin(phi) * Math.cos(t), c[1] + ry * Math.cos(phi), c[2] + rz * Math.sin(phi) * Math.sin(t)))
      }
      grid.push(row)
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) this.quad(grid[j][i], grid[j + 1][i], grid[j + 1][(i + 1) % seg], grid[j][(i + 1) % seg])
  }

  /** Горизонтальное кольцо (тор) с центром c, большим радиусом R и малым r. */
  torus(c, R, r, seg = 36, tube = 10) {
    const grid = []
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2
      const row = []
      for (let j = 0; j < tube; j++) {
        const s = (j / tube) * Math.PI * 2
        row.push(this.vertex(c[0] + (R + r * Math.cos(s)) * Math.cos(t), c[1] + r * Math.sin(s), c[2] + (R + r * Math.cos(s)) * Math.sin(t)))
      }
      grid.push(row)
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < tube; j++) this.quad(grid[i][j], grid[(i + 1) % seg][j], grid[(i + 1) % seg][(j + 1) % tube], grid[i][(j + 1) % tube])
  }
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }

/** Собирает документ из именованных мешей: [материал, Mesh]. */
async function build(file, parts) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene('scene')
  const node = doc.createNode('model')
  scene.addChild(node)
  const mesh = doc.createMesh('model')
  for (const [mat, m] of parts) {
    const material = doc.createMaterial(mat.name).setBaseColorFactor(mat.color).setRoughnessFactor(mat.roughness).setMetallicFactor(mat.metal).setDoubleSided(true)
    if (mat.emissive) material.setEmissiveFactor(mat.emissive)
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.pos)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(m.idx)).setBuffer(buffer))
      .setMaterial(material)
    mesh.addPrimitive(prim)
  }
  node.setMesh(mesh)
  await doc.transform(normals({ overwrite: true }))
  await new NodeIO().write(file, doc)
}

const BRASS = { name: 'brass', color: [0.69, 0.55, 0.34, 1], roughness: 0.35, metal: 0.85 }
const GLASS_BULB = { name: 'bulb', color: [1, 0.95, 0.82, 1], roughness: 0.2, metal: 0, emissive: [1, 0.85, 0.55] }
const WHITE = { name: 'white', color: [0.95, 0.93, 0.89, 1], roughness: 0.75, metal: 0 }
const BLACK = { name: 'black', color: [0.08, 0.08, 0.09, 1], roughness: 0.5, metal: 0.6 }

await mkdir('assets-src/own', { recursive: true })

// Классическая люстра: шесть рожков на кольце, цепь к потолку; высота 70 см, ширина 50 см.
{
  const metal = new Mesh(), bulbs = new Mesh()
  metal.sphere([0, 0.04, 0], 0.04, 0.05, 0.04)
  metal.tube([0, 0.05, 0], [0, 0.45, 0], 0.014, 0.014)
  metal.tube([0, 0.45, 0], [0, 0.7, 0], 0.006, 0.006, 8) // цепь
  metal.sphere([0, 0.2, 0], 0.035, 0.03, 0.035)
  metal.torus([0, 0.24, 0], 0.2, 0.01)
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t)
    metal.tube([0, 0.2, 0], [0.2 * c, 0.24, 0.2 * s], 0.008, 0.008, 8) // рожок от втулки к кольцу
    metal.tube([0.2 * c, 0.24, 0.2 * s], [0.2 * c, 0.3, 0.2 * s], 0.017, 0.012) // патрон
    bulbs.sphere([0.2 * c, 0.33, 0.2 * s], 0.026, 0.034, 0.026, 12, 8)
  }
  await build('assets-src/own/own_chandelier_classic.glb', [[BRASS, metal], [GLASS_BULB, bulbs]])
}

// Современная круглая люстра: плоский диффузор в кольце и три тяги; высота 50 см, ширина 64 см.
{
  const shade = new Mesh(), frame = new Mesh()
  shade.tube([0, 0.03, 0], [0, 0.08, 0], 0.29, 0.29, 48)
  frame.torus([0, 0.055, 0], 0.3, 0.014, 48, 10)
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2 + 0.3
    frame.tube([0.12 * Math.cos(t), 0.08, 0.12 * Math.sin(t)], [0.02 * Math.cos(t), 0.5, 0.02 * Math.sin(t)], 0.004, 0.004, 8)
  }
  frame.tube([0, 0.5, 0], [0, 0.52, 0], 0.05, 0.05, 16) // розетка у потолка
  await build('assets-src/own/own_chandelier_round.glb', [[WHITE, shade], [BLACK, frame]])
}

// Настенные предметы (D-30): перед смотрит на +Z, задняя плоскость лежит на z = −глубина/2, низ — y = 0.
const WOOD = { name: 'wood', color: [0.55, 0.38, 0.22, 1], roughness: 0.6, metal: 0 }
const SCREEN = { name: 'screen', color: [0.02, 0.025, 0.035, 1], roughness: 0.08, metal: 0.3 }
const GLASS_MIRROR = { name: 'mirror', color: [0.78, 0.84, 0.88, 1], roughness: 0.06, metal: 1 }
const ART_BLUE = { name: 'art-blue', color: [0.16, 0.32, 0.5, 1], roughness: 0.8, metal: 0 }
const ART_RED = { name: 'art-red', color: [0.72, 0.28, 0.2, 1], roughness: 0.8, metal: 0 }
const ART_SAND = { name: 'art-sand', color: [0.88, 0.8, 0.62, 1], roughness: 0.85, metal: 0 }

// Телевизор на стену: панель 110 × 64 см, глубина 4 см.
{
  const body = new Mesh(), screen = new Mesh()
  body.box(-0.55, 0, -0.02, 0.55, 0.64, 0.012)
  screen.box(-0.535, 0.015, 0.012, 0.535, 0.625, 0.016)
  await build('assets-src/own/own_tv_wall.glb', [[BLACK, body], [SCREEN, screen]])
}

// Картина в раме: 60 × 80 см, глубина 3 см; полотно — абстракция из трёх полос.
{
  const frame = new Mesh(), a = new Mesh(), b = new Mesh(), c = new Mesh()
  frame.box(-0.3, 0, -0.015, 0.3, 0.8, 0.005)
  a.box(-0.27, 0.03, 0.005, 0.27, 0.77, 0.008)
  b.box(-0.27, 0.03, 0.008, 0.27, 0.3, 0.011)
  c.box(-0.2, 0.34, 0.008, 0.08, 0.7, 0.011)
  await build('assets-src/own/own_picture.glb', [[WOOD, frame], [ART_SAND, a], [ART_BLUE, b], [ART_RED, c]])
}

// Зеркало в тонкой раме: 50 × 120 см, глубина 3 см.
{
  const frame = new Mesh(), glass = new Mesh()
  frame.box(-0.25, 0, -0.015, 0.25, 1.2, 0.015)
  glass.box(-0.23, 0.02, 0.015, 0.23, 1.18, 0.017)
  await build('assets-src/own/own_mirror.glb', [[BRASS, frame], [GLASS_MIRROR, glass]])
}

// Полка на кронштейнах: 80 × 20 см, толщина доски 3 см, кронштейны вниз ещё на 14 см.
{
  const board = new Mesh(), brackets = new Mesh()
  board.box(-0.4, 0.14, -0.1, 0.4, 0.17, 0.1)
  for (const x of [-0.3, 0.3]) {
    brackets.box(x - 0.01, 0.02, -0.1, x + 0.01, 0.14, -0.08)
    brackets.box(x - 0.01, 0.12, -0.1, x + 0.01, 0.14, 0.08)
  }
  await build('assets-src/own/own_shelf_wall.glb', [[WOOD, board], [BLACK, brackets]])
}

// Часы на стену: диаметр 32 см, глубина 4 см.
{
  const rim = new Mesh(), face = new Mesh(), hands = new Mesh()
  rim.tube([0, 0.16, -0.02], [0, 0.16, 0.02], 0.16, 0.16, 40)
  face.tube([0, 0.16, 0.02], [0, 0.16, 0.022], 0.147, 0.147, 40)
  hands.box(-0.007, 0.16, 0.022, 0.007, 0.225, 0.026) // часовая стрелка: короткая, вверх
  hands.box(-0.005, 0.155, 0.022, 0.12, 0.165, 0.028) // минутная: длинная, вправо
  await build('assets-src/own/own_clock_wall.glb', [[BLACK, rim], [WHITE, face], [BLACK, hands]])
}

console.log('Собственные модели записаны в assets-src/own/')
