const institutionalEmailPattern = /^[^@\s]+@bue\.edu\.ar$/i

export function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase('es')
}

export function isBueEmail(value?: string | null) {
  return institutionalEmailPattern.test(normalizeEmail(value || ''))
}

export const institutionalEmailHint = '@bue.edu.ar'
