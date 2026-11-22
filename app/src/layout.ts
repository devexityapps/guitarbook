import { useEffect, useState } from 'react'

export const DESKTOP_QUERY = '(min-width: 1024px)'

/** True at desktop width, where the Library and a song sit side by side. */
export function useDesktop(): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setMatch(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return match
}
