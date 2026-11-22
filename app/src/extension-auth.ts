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
// Progress notes for the extension to show when a sign-in stalls.
const trace = (text: string) => reply({ type: 'gb:trace', text })

async function signIn() {
  try {
    trace('page: starting Google sign-in')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(auth, provider)
    trace('page: Google sign-in finished')
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (!credential?.idToken) throw new Error('Google did not return a credential.')
    reply({ type: 'gb:credential', idToken: credential.idToken, accessToken: credential.accessToken ?? null })
  } catch (err) {
    reply({ type: 'gb:auth-error', message: err instanceof Error ? err.message : String(err) })
  }
}

window.addEventListener('message', (event) => {
  // Only our parent frame, and only when it is the extension.
  if (event.source !== window.parent) return
  if (event.origin !== EXTENSION_ORIGIN) {
    // Tell whoever embeds us (they can't read this unless they are the extension, so use '*' for the note only).
    window.parent.postMessage({ type: 'gb:trace', text: `page: ignored a message from ${event.origin}` }, '*')
    return
  }
  if ((event.data as { type?: string } | null)?.type === 'gb:start') void signIn()
})

window.addEventListener('error', (e) => trace(`page error: ${e.message}`))
window.addEventListener('unhandledrejection', (e) => trace(`page error: ${String(e.reason)}`))
trace('page: loaded')

if (window.parent === window) document.body.textContent = 'This page is used by the Guitarbook extension.'
