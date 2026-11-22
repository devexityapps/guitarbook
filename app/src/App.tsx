import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from './firebase'

function SignIn() {
  const [error, setError] = useState<string | null>(null)
  return (
    <main className="center">
      <h1>Guitarbook</h1>
      <p className="muted">Your songs and lessons, in one place.</p>
      <button className="primary" onClick={() => signInWithPopup(auth, googleProvider).catch((e) => setError(String(e.message ?? e)))}>
        Sign in with Google
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}

// Temporary scaffold check (step 1): write and read a doc under the user's own path.
function Home({ user }: { user: User }) {
  const [result, setResult] = useState<string>('')
  const ref = doc(db, 'users', user.uid, 'scaffold', 'test')

  async function run() {
    try {
      await setDoc(ref, { hello: 'world', at: serverTimestamp() })
      const snap = await getDoc(ref)
      setResult(`Read back own doc: ${JSON.stringify(snap.data()?.hello)}`)
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <main className="center">
      <h1>Library</h1>
      <p className="muted">Signed in as {user.email}</p>
      <button className="primary" onClick={run}>Write &amp; read test doc</button>
      {result && <p>{result}</p>}
      <button onClick={() => signOut(auth)}>Sign out</button>
    </main>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  if (user === undefined) return <main className="center muted">Loading…</main>
  return user ? <Home user={user} /> : <SignIn />
}
