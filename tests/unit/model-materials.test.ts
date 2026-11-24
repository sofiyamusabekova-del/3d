import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { describe, expect, it } from 'vitest'

// Этап 16.2: материалы реальных моделей каталога годятся для интерактивного и трассировочного вида:
// физически обоснованные (metallic-roughness), без сжатия геометрии, без неподдерживаемых расширений.
const DIR = 'public/catalog'
const ids = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

/**
 * Draco грузится с внешнего адреса и в приложении отключён (useGLTF(url, false)). Сжатие meshopt и квантование (этап 28)
 * разрешены: загрузчик распаковывает их сам до трассировки, декодер входит в three.js/drei.
 */
const COMPRESSED = ['KHR_draco_mesh_compression']
/** Расширения материалов, которых нет в трассировке три.js-пути каталога. */
const UNSUPPORTED = ['KHR_materials_pbrSpecularGlossiness']

describe('материалы моделей каталога', () => {
  it('каталог не пуст', () => expect(ids.length).toBeGreaterThanOrEqual(40))

  for (const id of ids) {
    it(`${id}: PBR-материалы в допустимых пределах, геометрия не сжата`, async () => {
      const doc = await io.read(join(DIR, id, `${id}.glb`))
      const root = doc.getRoot()
      const used = root.listExtensionsUsed().map((e) => e.extensionName)
      for (const bad of [...COMPRESSED, ...UNSUPPORTED]) expect(used, `расширение ${bad}`).not.toContain(bad)
      const mats = root.listMaterials()
      expect(mats.length).toBeGreaterThan(0)
      for (const m of mats) {
        const [r, g, b] = m.getBaseColorFactor()
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        // Цвет не нулевой: либо текстура, либо коэффициент заметно выше нуля (чёрная модель не видна в свете).
        expect(m.getBaseColorTexture() !== null || lum > 0.01, `${m.getName()}: чёрный материал без текстуры`).toBe(true)
        expect(m.getMetallicFactor()).toBeGreaterThanOrEqual(0)
        expect(m.getMetallicFactor()).toBeLessThanOrEqual(1)
        expect(m.getRoughnessFactor()).toBeGreaterThanOrEqual(0)
        expect(m.getRoughnessFactor()).toBeLessThanOrEqual(1)
        // Зеркало без текстур отражало бы окружение целиком: металл допускается только шероховатым.
        if (m.getMetallicFactor() > 0.9 && !m.getMetallicRoughnessTexture()) expect(m.getRoughnessFactor(), `${m.getName()}: гладкий металл`).toBeGreaterThan(0.05)
        // Прозрачность смешением (стекло дверок и шкафов) допустима, только если она настоящая: иначе
        // это лишний слой, который ломает порядок отрисовки и даёт шум в трассировке.
        if (m.getAlphaMode() === 'BLEND') expect(m.getBaseColorFactor()[3] < 1 || m.getBaseColorTexture() !== null, `${m.getName()}: BLEND без прозрачности`).toBe(true)
      }
      for (const t of root.listTextures()) expect(['image/webp', 'image/png', 'image/jpeg']).toContain(t.getMimeType())
    })
  }
})
