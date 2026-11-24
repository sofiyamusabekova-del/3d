import { describe, expect, it } from 'vitest'
import { apartmentIssues } from '../../src/scenario/flow'
import { buildApartment, templateById } from '../../src/scenario/layouts'
import { parseProject, serializeProject } from '../../src/scenario/projectFile'
import { projectToToken, shareUrl, SHARE_PREFIX, tokenFromHash, tokenToProject } from '../../src/scenario/shareLink'

// Ссылка на проект (этап 8 доработок, D-37).
const text = serializeProject(
  buildApartment(templateById('1b')!),
  { roomCount: 1, areaM2: 36, templateId: '1b', step: 'interior' },
  { hour: 15, lightsOff: {}, activeRoomId: null },
  new Date('2026-11-22T12:00:00Z'),
)

describe('ссылка на проект', () => {
  it('проект кодируется в безопасную для адреса строку и читается обратно без потерь', async () => {
    const token = await projectToToken(text)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = await tokenToProject(token)
    expect(back).not.toBeNull()
    expect(JSON.parse(back!)).toEqual(JSON.parse(text))
    expect(parseProject(back!, apartmentIssues).ok).toBe(true)
  })

  it('сжатие работает: ссылка заметно короче файла', async () => {
    const token = await projectToToken(text)
    expect(token.length).toBeLessThan(text.length / 3)
  })

  it('адрес собирается с префиксом, токен достаётся из хэша, чужой хэш игнорируется', async () => {
    const url = await shareUrl(text, 'https://example.test/app/')
    expect(url.startsWith(`https://example.test/app/${SHARE_PREFIX}`)).toBe(true)
    expect(tokenFromHash(url.slice(url.indexOf('#')))).toBe(await projectToToken(text))
    expect(tokenFromHash('#other')).toBeNull()
    expect(tokenFromHash('')).toBeNull()
  })

  it('повреждённая или обрезанная ссылка даёт null, а не исключение', async () => {
    const token = await projectToToken(text)
    expect(await tokenToProject(token.slice(0, 40))).toBeNull()
    expect(await tokenToProject('!!!не-токен')).toBeNull()
    expect(await tokenToProject('')).toBeNull()
  })
})
