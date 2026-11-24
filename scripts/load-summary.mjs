// Сводка отчётов scripts/measure-load.mjs: node scripts/load-summary.mjs before after
import { readFileSync } from 'node:fs'
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(`docs/reports/stage28/load-${f}.json`, 'utf8'))
  console.log(f, 'interiorMs', j.interiorMs, 'modelsMs', j.modelsMs, 'DCL', j.nav.domContentLoadedMs)
  for (const [k, v] of Object.entries(j.steps)) console.log(' ', k, v.requests, 'req', v.rawKB, 'KB gz', v.gzipKB)
  console.log('  total', j.totalRawKB, j.totalGzipKB, j.totalMs)
}
