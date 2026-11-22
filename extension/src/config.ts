/** The app's origin, no trailing slash. The app's routes are hash routes (`#/`, `#/song/<id>`): keep in step with the app. */
export const APP_URL = (import.meta.env.VITE_APP_URL || 'https://guitarbook-eafba.web.app').replace(/\/+$/, '')
export const libraryUrl = () => `${APP_URL}/#/`
export const songUrl = (id: string) => `${APP_URL}/#/song/${id}`
