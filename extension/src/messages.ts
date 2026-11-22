// Messages between the popup, the background service worker, the offscreen document and the hosted sign-in page.

/** popup -> background: start Google sign-in. */
export type StartSignIn = { type: 'gb:sign-in' }
/** background -> offscreen: load the hosted page and ask it to sign in. */
export type OffscreenStart = { target: 'offscreen'; type: 'gb:start' }
/** hosted page -> offscreen -> background */
export type CredentialMsg = { type: 'gb:credential'; idToken: string; accessToken: string | null }
export type AuthErrorMsg = { type: 'gb:auth-error'; message: string }

/** chrome.storage.local key: the last sign-in error, shown once in the popup. */
export const AUTH_ERROR_KEY = 'authError'

/** chrome.storage.local key: when the current sign-in started (ms). Used to recognise the Google window. */
export const SIGN_IN_STARTED_KEY = 'signInStartedAt'
