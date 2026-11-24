import { mkdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Этапы 3–8 доработок (D-32…D-37): размеры, наборы, список покупок, заметки, варианты, ссылка. Кадры — docs/reports/extras.
const OUT = 'docs/reports/extras'
mkdirSync(OUT, { recursive: true })
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

async function openRoom(page: Page, room = 'Комната') {
  await page.goto('/')
  await page.getByTestId('room-count-1').check()
  await page.getByTestId('area-input').fill('36')
  await page.getByTestId('submit-params').click()
  await page.getByTestId('choose-1b').click()
  await page.getByTestId('to-interior').click()
  await expect(page.getByTestId('interior-scene')).toBeVisible()
  const id = await page.evaluate((name) => {
    const p = (window as any).__interior.project.getState().history.present
    return (Object.values(p.rooms) as any[]).find((r) => r.name === name).id as string
  }, room)
  await page.evaluate((rid) => (window as any).__interior.store.getState().enter(rid), id)
  await expect(page.getByTestId('active-room')).toHaveText(room)
}
const furniture = (page: Page) => page.evaluate(() => Object.values((window as any).__interior.project.getState().history.present.furniture) as any[])

test('набор, размеры, список покупок, заметка, варианты и ссылка', async ({ page, browser }) => {
  await openRoom(page)

  // Этап 4: готовый набор одной кнопкой.
  await page.getByTestId('furnish-room').click()
  const items = await furniture(page)
  expect(items.length).toBeGreaterThanOrEqual(4)
  await expect(page.getByTestId('message')).toHaveCount(0)
  await page.screenshot({ path: `${OUT}/furnish-chrome.png` })

  // Этап 3: у выбранного предмета видны размеры до стен и расстояние до двери.
  await page.evaluate((id) => (window as any).__interior.editor.getState().select(id), items[0].id)
  expect(await page.getByTestId('plan-dim').count()).toBeGreaterThanOrEqual(1)
  await expect(page.getByTestId('door-distance')).toContainText('До ближайшей двери')
  await page.getByTestId('show-dims').uncheck()
  await expect(page.getByTestId('plan-dim')).toHaveCount(0)
  await page.getByTestId('show-dims').check()

  // Этап 5: список покупок и CSV.
  await page.getByTestId('shopping').locator('summary').click()
  expect(await page.locator('[data-testid^=shopping-row-]').count()).toBeGreaterThanOrEqual(3)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('shopping-csv').click()])
  expect(dl.suggestedFilename()).toBe('spisok-pokupok.csv')
  const csv = readFileSync(await dl.path()!, 'utf8')
  expect(csv).toContain('Предмет;Категория;Количество')

  // Этап 6: заметка на плане.
  await page.getByTestId('note-add').click()
  const noteId = await page.evaluate(() => Object.keys((window as any).__interior.project.getState().history.present.notes)[0])
  await page.getByTestId(`note-text-${noteId}`).fill('здесь розетка')
  await page.getByTestId(`note-text-${noteId}`).press('Enter')
  await expect(page.getByTestId(`plan-note-${noteId}`)).toContainText('здесь розетка')

  // Этап 7: вариант расстановки, потом другая расстановка и возврат.
  await page.getByTestId('layout-save').click()
  const layoutId = await page.evaluate(() => Object.keys((window as any).__interior.project.getState().history.present.layouts)[0])
  await expect(page.getByTestId(`layout-diff-${layoutId}`)).toHaveText('сейчас')
  await page.evaluate((id) => (window as any).__interior.editor.getState().select(id), items[1].id)
  await page.getByTestId('remove').click()
  expect((await furniture(page)).length).toBeLessThan(items.length)
  await expect(page.getByTestId(`layout-diff-${layoutId}`)).toContainText('отличается')
  await page.getByTestId(`layout-show-${layoutId}`).click()
  expect((await furniture(page)).length).toBe(items.length)
  await page.screenshot({ path: `${OUT}/extras-chrome.png` })

  // Этап 8: ссылка открывает тот же проект в чистом браузере.
  await page.getByTestId('project-share-link').click()
  await expect(page.getByTestId('project-notice')).toContainText('Ссылка')
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(url).toContain('#p=')
  await page.goto('about:blank') // первая вкладка с WebGL закрывается: две сцены подряд в одном браузере роняют видеодрайвер
  const ctx = await browser.newContext({
    baseURL: 'http://localhost:5173',
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'interior-planner:skip-start', value: '1' }] }] },
  })
  const page2 = await ctx.newPage()
  await page2.goto(url)
  await expect(page2.getByTestId('project-notice')).toContainText('по ссылке')
  await expect(page2.getByTestId('interior-scene')).toBeVisible()
  await page2.waitForFunction(() => !!(window as any).__interior)
  expect((await furniture(page2)).length).toBe(items.length)
  expect(await page2.evaluate(() => location.hash)).toBe('') // адрес очищен
  await ctx.close()
})
