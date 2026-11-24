import { readFile, writeFile } from 'node:fs/promises'

/**
 * Обновляет в docs/ASSETS.md таблицу рабочего каталога (между маркерами) по манифесту
 * src/catalog/catalog.generated.json: реестр не расходится с файлами.
 * Запуск: node scripts/catalog/report.mjs
 */
const START = '<!-- catalog:start -->'
const END = '<!-- catalog:end -->'
const manifest = JSON.parse(await readFile('src/catalog/catalog.generated.json', 'utf8'))
const kb = (n) => Math.round(n / 1024)
const f1 = (n) => String(n).replace('.', ',')

const rows = Object.entries(manifest.items).map(([id, g]) =>
  `| ${id} | ${g.name} | ${g.category} | ${g.url} | ${g.authors.join(', ')} | ${g.license} | ${g.attribution ?? 'не требуется'} | ${g.retrievedAt} | ${f1(g.widthCm)} × ${f1(g.depthCm)} × ${f1(g.heightCm)} | ${kb(g.srcBytes)} → ${kb(g.glbBytes)} | ${g.source === 'kenney' ? 'нет текстур' : f1(g.minPsnrDb)} |`)

const kenney = Object.entries(manifest.items).filter(([, g]) => g.source === 'kenney')
const kenneyRows = kenney.map(([id, g]) => `| ${id} | ${g.sourceFile} | ${g.rawSizeCm.map(f1).join(' × ')} | ${g.scale.map(f1).join(' × ')} | ${f1(g.widthCm)} × ${f1(g.depthCm)} × ${f1(g.heightCm)} |`)
const kenneyBlock = kenney.length === 0 ? '' : [
  '',
  '**Kenney Furniture Kit** (https://kenney.nl/assets/furniture-kit, CC0, автор Kenney; архив скачан вручную пользователем, его лицензия — `License.txt` в архиве). Набор стилизован и заметно мельче реальной мебели, поэтому каждая модель приведена к реальным габаритам: одно значение в перечне (`scripts/catalog/items.mjs`) — равномерный масштаб, три — осевой (только для «коробочных» предметов). Начало координат перенесено в центр основания, перед модели — +Z.',
  '',
  '| Модель | Файл набора | Исходный размер, см (Ш × Г × В) | Масштаб по осям x × y × z | Итоговый размер, см (Ш × Г × В) |',
  '|---|---|---|---|---|',
  ...kenneyRows,
].join('\n')

const fm = Object.entries(manifest.items).filter(([, g]) => g.source === 'furnimesh')
const fmBlock = fm.length === 0 ? '' : [
  '',
  '**FurniMesh** (https://furnimesh.com/library/, скачано 2026-11-16 с согласия пользователя). Модели сгенерированы нейросетью FurniMesh по фото пользователей сайта; автор и исходное фото не указаны. Лицензии в виде отдельного текста нет: сайт заявляет, что файлы библиотеки бесплатны и допускают коммерческое использование без указания авторства (главная страница и страницы моделей; условия https://furnimesh.com/terms/ библиотеку отдельно не описывают). Это не CC0: при публикации проекта условия стоит перепроверить. Масштаб в файлах произвольный, поэтому реальный размер задан в `scripts/catalog/items.mjs` (равномерный масштаб по одной оси); геометрия упрощена meshoptimizer, текстуры 2048 px → WebP (при 1024 px PSNR ниже 35 дБ). Исходники — `assets-src/furnimesh/<id>/source.glb`. Скачаны, но не включены: fm_table_lamp_velvet (дефекты абажура, не упрощается), fm_desk_black (угловой стол 290 × 140 см), fm_wall_lamp_travertine (бра: настенный монтаж с высотой — этап 21), fm_vanity_walnut (брак генерации: бесформенные куски внутри, нет фасада).',
  '',
  '| Модель | Страница | Масштаб, задано | Поворот, ° | Треугольников до → после | Итоговый размер, см (Ш × Г × В) |',
  '|---|---|---|---|---|---|',
  ...fm.map(([id, g]) => `| ${id} | ${g.url} | ${f1(g.scale[0])} | ${g.rotationDeg ?? 0} | ${g.trianglesBefore} → ${g.trianglesAfter} | ${f1(g.widthCm)} × ${f1(g.depthCm)} × ${f1(g.heightCm)} |`),
].join('\n')

const total = Object.values(manifest.items).reduce((s, g) => ({ src: s.src + g.srcBytes, out: s.out + g.glbBytes }), { src: 0, out: 0 })
const table = [
  START,
  '| Модель | Название | Категория | Источник | Авторы | Лицензия | Авторство | Получено | Габариты, см (Ш × Г × В) | Вес, КБ до → после | PSNR, дБ |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  `Всего ${rows.length} предметов; вес исходников ${(total.src / 1048576).toFixed(1).replace('.', ',')} МБ → GLB ${(total.out / 1048576).toFixed(1).replace('.', ',')} МБ. Габариты измерены по геометрии готового GLB; PSNR — худшая из текстур цвета после сжатия против исходной (порог 35 дБ).`,
  kenneyBlock,
  fmBlock,
  END,
].join('\n')

const path = 'docs/ASSETS.md'
const doc = await readFile(path, 'utf8')
const a = doc.indexOf(START)
const b = doc.indexOf(END)
const next = a >= 0 && b > a ? doc.slice(0, a) + table + doc.slice(b + END.length) : doc.replace('## Отделка стен', `## Рабочий каталог мебели (этап 13, D-25)\n\n${table}\n\n## Отделка стен`)
await writeFile(path, next)
console.log(`ASSETS.md обновлён: ${rows.length} предметов`)
