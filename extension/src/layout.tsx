import type { ReactNode } from 'react'

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="head">
      <img src="icons/icon-32.png" width={24} height={24} alt="" />
      <span className="name">Guitarbook</span>
      {right && <span className="head-right">{right}</span>}
    </header>
  )
}

/** `primary` (when given) is the screen's main action, stacked above the library link as in the mockups. */
export function Footer({ openLabel, onOpen, email, onSignOut, primary }: {
  /** Omit both to show no library button (e.g. when you are already in the app). */
  openLabel?: string
  onOpen?: () => void
  email: string | null
  onSignOut: () => void
  primary?: ReactNode
}) {
  const who = (
    <div className="who">
      <span className="email" title={email ?? ''}>{email}</span>
      <button className="link" onClick={onSignOut}>Sign out</button>
    </div>
  )
  if (primary && openLabel && onOpen) {
    return (
      <footer className="foot stacked">
        {primary}
        <div className="foot-row">
          <button className="link big" onClick={onOpen}>{openLabel}</button>
          {who}
        </div>
      </footer>
    )
  }
  return (
    <footer className="foot">
      {openLabel && onOpen ? <button className="btn primary" onClick={onOpen}>{openLabel}</button> : <span />}
      {who}
    </footer>
  )
}
