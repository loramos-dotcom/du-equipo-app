export function externalLinkUrl(value?: string) {
  const raw = value?.trim()
  if (!raw || /\s/.test(raw)) return undefined

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`

  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}
