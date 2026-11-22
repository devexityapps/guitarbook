import { useEffect, useState } from 'react'

// Tiny hash router (no extra dependency): "#/song/abc/edit?x=1".
export interface Route {
  path: string[]
  query: URLSearchParams
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [pathPart = '/', queryPart = ''] = raw.split('?')
  return { path: pathPart.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(queryPart) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

// How many in-app entries sit behind the current one, so Back never leaves the app.
let depth = 0
let replacing = false
try {
  window.history.replaceState({ depth: 0 }, '')
} catch {
  /* history unavailable: goBack falls back to the given path */
}
window.addEventListener('hashchange', () => {
  const state = window.history.state as { depth?: number } | null
  if (typeof state?.depth === 'number') depth = state.depth // back / forward
  else {
    if (!replacing) depth += 1 // a new entry (link click or navigate)
    try {
      window.history.replaceState({ depth }, '')
    } catch {
      /* ignore */
    }
  }
  replacing = false
})

export function navigate(to: string, replace = false) {
  if (replace) {
    replacing = true
    window.location.replace(`#${to}`)
  } else window.location.hash = to
}

/** Go back if there is an in-app entry behind this one, otherwise to `fallback`. */
export function goBack(fallback: string) {
  if (depth > 0) window.history.back()
  else navigate(fallback, true)
}
