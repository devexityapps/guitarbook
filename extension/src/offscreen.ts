// Offscreen document: embeds the hosted sign-in page (extension/SPEC.md §3) and relays messages
// between that page and the background service worker.
import { APP_URL } from './config'

const APP_ORIGIN = new URL(APP_URL).origin
let frame: HTMLIFrameElement | null = null
let stage = 'started'
let timer: ReturnType<typeof setTimeout> | undefined

// The last step reached, named in the timeout error so a stalled sign-in can be diagnosed.
const trace = (text: string) => {
  stage = text
}

function start() {
  trace('offscreen: start received')
  clearTimeout(timer)
  timer = setTimeout(() => {
    void chrome.runtime.sendMessage({ type: 'gb:auth-error', message: `The sign-in page didn't answer within 2 minutes (last step: ${stage}).` })
  }, 120000)
  frame?.remove()
  const f = document.createElement('iframe')
  f.src = `${APP_URL}/extension-auth.html?t=${Date.now()}` // the query skips any stale cached copy of the page
  f.addEventListener('load', () => {
    trace('offscreen: sign-in page loaded, asking it to start')
    f.contentWindow?.postMessage({ type: 'gb:start' }, APP_ORIGIN)
  })
  f.addEventListener('error', () => trace('offscreen: sign-in page failed to load'))
  document.body.append(f)
  frame = f
}

chrome.runtime.onMessage.addListener((message: { target?: string; type?: string }) => {
  if (message.target === 'offscreen' && message.type === 'gb:start') start()
})

window.addEventListener('message', (event) => {
  if (event.origin !== APP_ORIGIN || event.source !== frame?.contentWindow) return
  const data = event.data as { type?: string; text?: string } | null
  if (data?.type === 'gb:trace') {
    trace(String(data.text))
    return
  }
  if (data?.type === 'gb:credential' || data?.type === 'gb:auth-error') {
    clearTimeout(timer)
    void chrome.runtime.sendMessage(data)
  }
})
