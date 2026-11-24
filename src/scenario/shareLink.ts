/**
 * Ссылка на проект (этап 8 доработок, SPEC D-37): весь проект (тот же JSON, что и файл) сжимается gzip и кладётся в
 * часть адреса после «#p=» в кодировке base64url. На сервер ничего не уходит: часть после «#» браузер не отправляет.
 */
export const SHARE_PREFIX = '#p='
/** Ссылка длиннее этого предела плохо переносится мессенджерами; пользователю показывается предупреждение. */
export const SHARE_SOFT_LIMIT = 8000

const toB64Url = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>))
  return new Uint8Array(await out.arrayBuffer())
}

/** Текст файла проекта → часть адреса («p=…» без «#»). */
export async function projectToToken(projectText: string): Promise<string> {
  const compact = JSON.stringify(JSON.parse(projectText)) // без отступов
  return toB64Url(await pipe(new TextEncoder().encode(compact), new CompressionStream('gzip')))
}

/** Часть адреса → текст файла проекта; null, если это не наша ссылка или она повреждена. */
export async function tokenToProject(token: string): Promise<string | null> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return null
    return new TextDecoder().decode(await pipe(fromB64Url(token), new DecompressionStream('gzip')))
  } catch { return null }
}

/** Ссылка на проект для адресной строки. */
export async function shareUrl(projectText: string, base: string): Promise<string> {
  return `${base}${SHARE_PREFIX}${await projectToToken(projectText)}`
}

/** Токен из адреса страницы, если он там есть. */
export const tokenFromHash = (hash: string): string | null => (hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null)
