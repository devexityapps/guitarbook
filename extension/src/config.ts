/** The app's origin, no trailing slash. The app's routes are hash routes (`#/`, `#/song/<id>`): keep in step with the app. */
export const APP_URL = (import.meta.env.VITE_APP_URL || 'https://guitarbook-eafba.web.app').replace(/\/+$/, '')
export const libraryUrl = () => `${APP_URL}/#/`
export const songUrl = (id: string) => `${APP_URL}/#/song/${id}`

const OWN_HOSTS = new Set(
  [new URL(APP_URL).host, import.meta.env.VITE_FIREBASE_AUTH_DOMAIN].filter((h): h is string => !!h), // the app is served on both
)
/** True for the Guitarbook app's own pages, which are never saved as links. */
export const isOwnApp = (url: string) => {
  try {
    return OWN_HOSTS.has(new URL(url).host)
  } catch {
    return false
  }
}
