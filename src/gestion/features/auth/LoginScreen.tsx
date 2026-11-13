import { useState, type FormEvent } from 'react'
import { LogIn, LoaderCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function getAccessErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('redirect') || normalized.includes('site url')) {
    return 'La URL de acceso todavia no esta autorizada. Revisa la configuracion de Supabase.'
  }
  if (normalized.includes('provider') || normalized.includes('google')) {
    return 'El acceso con Google Workspace todavia no fue habilitado en Supabase.'
  }
  return `No pudimos iniciar el acceso: ${message}`
}

export function LoginScreen({ initialError = '' }: { initialError?: string }) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(initialError)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return

    setConnecting(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { hd: 'bue.edu.ar' },
      },
    })
    setConnecting(false)
    if (authError) setError(getAccessErrorMessage(authError.message))
  }

  return (
    <main className="login-page">
      <section className="login-photo" aria-label="Aula de una escuela de la Ciudad">
        <div className="login-brand"><span>BA</span><strong>Buenos Aires Ciudad</strong></div>
        <div className="login-photo-copy">
          <span>Gestion educativa 2026</span>
          <h1>Informacion clara para decidir y actuar.</h1>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <span className="environment-label">Nueva plataforma</span>
          <h2>Tablero de Gestion</h2>
          <p>Ingresa directamente con tu cuenta institucional de Google Workspace.</p>
          <form onSubmit={handleSubmit}>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" type="submit" disabled={connecting}>
              {connecting ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
              {connecting ? 'Conectando' : 'Ingresar con Google Workspace'}
            </button>
          </form>
          <small>Acceso exclusivo para cuentas institucionales @bue.edu.ar.</small>
        </div>
      </section>
    </main>
  )
}
