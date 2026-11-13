export function avatarInitials(name?: string) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (!words.length) return 'US'
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('es')
  return `${words[0][0]}${words[words.length - 1][0]}`.toLocaleUpperCase('es')
}
