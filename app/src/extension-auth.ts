// Hosted sign-in page for the Chrome extension (extension/SPEC.md §3).
// The extension's offscreen document embeds this page in an iframe and sends { type: 'gb:start' }.
// We run Google sign-in in a popup and hand the Google credential back to the parent, and only to
// the extension's own origin. The extension then signs in to Firebase with it.
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { EXTENSION_ID } from '@shared'

const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})
const auth = getAuth(app)

const reply = (message: unknown) => window.parent.postMessage(message, EXTENSION_ORIGIN)

async function signIn() {
  try {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (!credential?.idToken) throw new Error('Google did not return a credential.')
    reply({ type: 'gb:credential', idToken: credential.idToken, accessToken: credential.accessToken ?? null })
  } catch (err) {
    reply({ type: 'gb:auth-error', message: err instanceof Error ? err.message : String(err) })
  }
}

window.addEventListener('message', (event) => {
  // Only our parent frame, and only when it is the extension.
  if (event.source !== window.parent || event.origin !== EXTENSION_ORIGIN) return
  if ((event.data as { type?: string } | null)?.type === 'gb:start') void signIn()
})

if (window.parent === window) document.body.textContent = 'This page is used by the Guitarbook extension.'
