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

export function Footer({ openLabel, onOpen, email, onSignOut }: { openLabel: string; onOpen: () => void; email: string | null; onSignOut: () => void }) {
  return (
    <footer className="foot">
      <button className="btn primary" onClick={onOpen}>{openLabel}</button>
      <div className="who">
        <span className="email" title={email ?? ''}>{email}</span>
        <button className="link" onClick={onSignOut}>Sign out</button>
      </div>
    </footer>
  )
}
