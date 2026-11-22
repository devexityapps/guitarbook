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

export function navigate(to: string, replace = false) {
  if (replace) window.location.replace(`#${to}`)
  else window.location.hash = to
}

/** Go back if there is history inside the app, otherwise to `fallback`. */
export function goBack(fallback: string) {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback)
}
