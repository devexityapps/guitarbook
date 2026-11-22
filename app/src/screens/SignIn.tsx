import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

export function SignIn() {
  const [error, setError] = useState<string | null>(null)
  return (
    <main className="center">
      <h1 className="brand">Guitarbook</h1>
      <p className="muted">Your songs and lessons, in one place.</p>
      <button className="btn primary" onClick={() => signInWithPopup(auth, googleProvider).catch((e) => setError(String(e.message ?? e)))}>
        Sign in with Google
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
