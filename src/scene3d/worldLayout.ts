/**
 * Внешний мир за окнами (этап 20): расположение домов, деревьев и холмов. Всё процедурное, без загрузки файлов,
 * детерминированное: один и тот же вид из окна при каждом запуске. Единицы — метры сцены, мир вокруг центра квартиры.
 */

export interface WorldHouse {
  x: number; z: number; w: number; d: number; h: number; roofH: number; rotY: number; wall: string; roof: string
  /** Окна: центр на стене (локальные оси дома), нормаль наружу — угол поворота плоскости вокруг Y. */
  windows: Array<{ x: number; y: number; z: number; rotY: number; lit: boolean }>
}
export interface WorldTree { x: number; z: number; h: number; r: number; conifer: boolean; color: string }
export interface WorldHill { x: number; z: number; r: number; h: number; color: string }
export interface WorldLayout { houses: WorldHouse[]; trees: WorldTree[]; hills: WorldHill[] }

/** Небольшой детерминированный генератор псевдослучайных чисел. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WALLS = ['#d9c7a8', '#cbb99e', '#bfae96', '#e2d6c0', '#a9b5c0', '#c9a99a', '#e8e0d0']
const ROOFS = ['#8a4b3a', '#6d4a40', '#4b5560', '#7a3f35', '#58493f']
const LEAVES = ['#4f7a3c', '#5d8a46', '#3f6b34', '#6b8f45', '#486f3e']
const CONIFERS = ['#2f5a3a', '#35643f', '#294f35']
const HILLS = ['#7a8fa3', '#6f869c', '#8497aa']

/**
 * @param exclusionRadius радиус вокруг центра, в котором ничего не стоит: сама квартира и двор перед окнами.
 */
export function worldLayout(exclusionRadius: number, seed = 20): WorldLayout {
  const rnd = mulberry32(seed)
  const between = (a: number, b: number) => a + (b - a) * rnd()
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length) % xs.length]
  const polar = (r0: number, r1: number) => {
    const a = rnd() * Math.PI * 2
    const r = between(r0, r1)
    return { x: Math.cos(a) * r, z: Math.sin(a) * r }
  }

  const houses: WorldHouse[] = []
  const placed: Array<{ x: number; z: number; r: number }> = []
  for (let n = 0, tries = 0; n < 26 && tries < 400; tries++) {
    const w = between(8, 16), d = between(7, 12), h = Math.round(between(2, 5)) * 3
    const p = polar(exclusionRadius + 16, exclusionRadius + 80)
    const r = Math.hypot(w, d) / 2 + 2
    if (placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + r)) continue
    placed.push({ ...p, r })
    const rotY = Math.round(rnd() * 3) * (Math.PI / 2) + between(-0.12, 0.12)
    const windows: WorldHouse['windows'] = []
    const floors = Math.floor(h / 3)
    // Четыре стены: нормаль по ±Z (ширина w) и ±X (глубина d); окна по сетке 3 м.
    const faces = [
      { len: w, nx: 0, nz: 1, rot: 0 },
      { len: w, nx: 0, nz: -1, rot: Math.PI },
      { len: d, nx: 1, nz: 0, rot: Math.PI / 2 },
      { len: d, nx: -1, nz: 0, rot: -Math.PI / 2 },
    ]
    for (const f of faces) {
      const cols = Math.max(1, Math.floor(f.len / 3))
      for (let c = 0; c < cols; c++) {
        const along = (c - (cols - 1) / 2) * 3
        for (let fl = 0; fl < floors; fl++) {
          const half = (f.nx !== 0 ? w : d) / 2 + 0.03
          windows.push({
            x: f.nx !== 0 ? f.nx * half : along,
            y: 1.6 + fl * 3,
            z: f.nz !== 0 ? f.nz * half : along,
            rotY: f.rot,
            lit: rnd() < 0.55,
          })
        }
      }
    }
    houses.push({ ...p, w, d, h, roofH: between(2.5, 5), rotY, wall: pick(WALLS), roof: pick(ROOFS), windows })
    n++
  }

  const trees: WorldTree[] = []
  for (let n = 0, tries = 0; n < 70 && tries < 600; tries++) {
    const p = polar(exclusionRadius + 9, exclusionRadius + 90)
    if (placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 1.5)) continue
    const conifer = rnd() < 0.3
    const h = between(4, 11)
    trees.push({ ...p, h, r: conifer ? h * 0.28 : h * between(0.3, 0.42), conifer, color: conifer ? pick(CONIFERS) : pick(LEAVES) })
    n++
  }

  const hills: WorldHill[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + between(-0.12, 0.12)
    const r = between(150, 190)
    hills.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: between(30, 55), h: between(12, 30), color: pick(HILLS) })
  }
  return { houses, trees, hills }
}
