import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth/web-extension'
import { auth } from './firebase'
import { AUTH_ERROR_KEY, SIGN_IN_STARTED_KEY, type AuthErrorMsg, type CredentialMsg } from './messages'

const OFFSCREEN_PATH = 'offscreen.html'
const offscreenUrl = () => chrome.runtime.getURL(OFFSCREEN_PATH)

async function closeOffscreen() {
  try {
    await chrome.offscreen.closeDocument()
  } catch {
    // none open
  }
}

async function startSignIn() {
  await chrome.storage.local.remove(AUTH_ERROR_KEY)
  await chrome.storage.local.set({ [SIGN_IN_STARTED_KEY]: Date.now() })
  await closeOffscreen() // a previous attempt may have been abandoned (Google window closed)
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['IFRAME_SCRIPTING'],
    justification: 'Hosts the Guitarbook sign-in page, which runs Google sign-in in a popup.',
  })
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'gb:start' })
}

// The Google window is opened by the hidden sign-in page, so Chrome doesn't raise it. Bring any popup window
// created during a sign-in to the front.
const SIGN_IN_WINDOW_MS = 2 * 60 * 1000
chrome.windows.onCreated.addListener(async (win) => {
  if (win.type !== 'popup' || win.id === undefined) return
  const started = (await chrome.storage.local.get(SIGN_IN_STARTED_KEY))[SIGN_IN_STARTED_KEY]
  if (typeof started === 'number' && Date.now() - started < SIGN_IN_WINDOW_MS) {
    await chrome.windows.update(win.id, { focused: true }).catch(() => {})
  }
})

async function finishSignIn(msg: CredentialMsg) {
  try {
    await signInWithCredential(auth, GoogleAuthProvider.credential(msg.idToken, msg.accessToken))
  } catch (err) {
    await chrome.storage.local.set({ [AUTH_ERROR_KEY]: err instanceof Error ? err.message : String(err) })
  } finally {
    await chrome.storage.local.remove(SIGN_IN_STARTED_KEY)
    await closeOffscreen()
  }
}

chrome.runtime.onMessage.addListener((message: { type?: string }, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  switch (message.type) {
    case 'gb:sign-in':
      startSignIn().then(
        () => sendResponse({ ok: true }),
        (err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      )
      return true // async response
    case 'gb:credential':
    case 'gb:auth-error':
      // Only the offscreen document may send these.
      if (sender.url !== offscreenUrl()) return
      if (message.type === 'gb:credential') void finishSignIn(message as CredentialMsg)
      else {
        void chrome.storage.local.set({ [AUTH_ERROR_KEY]: (message as AuthErrorMsg).message }).then(closeOffscreen)
      }
      return
  }
})
