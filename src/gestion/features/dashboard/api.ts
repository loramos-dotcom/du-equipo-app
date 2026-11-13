import { institutionalEmailHint, isBueEmail, normalizeEmail } from '../../lib/institutionalAccess'
import { supabase } from '../../lib/supabase'

async function readFunctionError(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const context = 'context' in error ? (error as { context?: unknown }).context : undefined
  if (!(context instanceof Response)) return ''
  try {
    const payload = await context.clone().json() as { error?: unknown; message?: unknown }
    return String(payload.error || payload.message || '')
  } catch {
    try {
      return await context.clone().text()
    } catch {
      return ''
    }
  }
}

export async function generateGoogleDocReport(input: {
  title: string
  subtitle?: string
  areaName: string
  projectIds: string[]
}): Promise<{ scriptPayload: GoogleReportScriptPayload }> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.functions.invoke('generate-area-report', { body: input })
  if (error) {
    const detail = await readFunctionError(error)
    throw new Error(detail || error.message || 'No se pudo generar el Google Doc.')
  }
  if (data?.error) throw new Error(String(data.error))
  const payload = data?.scriptPayload as GoogleReportScriptPayload | undefined
  if (!payload || payload.action !== 'v3Report' || typeof payload.report?.text !== 'string') {
    throw new Error('El generador no devolvió un reporte válido.')
  }
  return { scriptPayload: payload }
}

export const GOOGLE_REPORT_WEB_APP_URL = 'https://script.google.com/a/bue.edu.ar/macros/s/AKfycbzArXcv44YY-P3A0XXnJ1aH1cwTBEQ6bUzn8huL-PlNJ5OHsbL3-3FPiZGN1bjTqI6vog/exec'

export interface GoogleReportScriptPayload {
  action: 'v3Report'
  title: string
  report: {
    text: string
    textStyles: Array<Record<string, unknown>>
    paragraphStyles: Array<Record<string, unknown>>
  }
}

export interface AccessGrant {
  email: string
  displayName: string
  areaKeys: string[]
  canEditDashboard: boolean
  updatedAt: string
}

export async function fetchAccessGrants(): Promise<AccessGrant[]> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase
    .from('access_grants')
    .select('email,display_name,area_keys,dashboard_edit,updated_at')
    .order('email')
  if (error) throw error
  return (data ?? []).map((row) => ({
    email: row.email,
    displayName: row.display_name || '',
    areaKeys: Array.isArray(row.area_keys) ? row.area_keys : [],
    canEditDashboard: Boolean(row.dashboard_edit),
    updatedAt: row.updated_at,
  }))
}

export async function saveAccessGrant(input: Omit<AccessGrant, 'updatedAt'>) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const email = normalizeEmail(input.email)
  if (!isBueEmail(email)) throw new Error(`Solo se pueden asignar accesos a cuentas ${institutionalEmailHint}.`)
  const { error } = await supabase.rpc('set_access_grant', {
    target_email: email,
    target_display_name: input.displayName,
    target_area_keys: input.areaKeys,
    target_dashboard_edit: input.canEditDashboard,
  })
  if (error) throw error
}

export async function deleteAccessGrant(email: string) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.rpc('delete_access_grant', { target_email: normalizeEmail(email) })
  if (error) throw error
}
