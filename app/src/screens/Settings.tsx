import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { exportData, saveSetting, useSettings, useSongs, useUid } from '../data'
import { IconBack, IconDownload } from '../ui'

// SPEC §4.7 (Settings, minimal), laid out as design/settings.png.

const STALE_CHOICES = [7, 14, 30, 60, 90] as const

export function Settings() {
  const uid = useUid()
  const songs = useSongs()
  const settings = useSettings()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const email = auth.currentUser?.email ?? null

  const download = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const json = await exportData(uid, settings, songs ?? [])
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `guitarbook-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    }
    setExporting(false)
  }

  return (
    <main className="screen">
      <header className="topbar settings-top">
        <a className="icon-btn" href="#/" aria-label="Back to library"><IconBack /></a>
        <h1 className="settings-title">Settings</h1>
      </header>
      <div className="pad">
        <h2 className="section">Library</h2>
        <div className="stack">
          <div className="card settings-card">
            <div className="settings-card-title">Highlight items not opened in</div>
            <p className="muted small">Older items show their time in amber.</p>
            <div className="stale-choices" role="radiogroup" aria-label="Highlight items not opened in">
              {STALE_CHOICES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={settings.staleDays === d}
                  aria-label={`${d} days`}
                  className={`stale-choice${settings.staleDays === d ? ' on' : ''}`}
                  onClick={() => saveSetting(uid, 'staleDays', d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <label className="card settings-card settings-toggle">
            <div>
              <div className="settings-card-title">Show thumbnails</div>
              <p className="muted small">From YouTube links. Loaded from YouTube each time; nothing is stored.</p>
            </div>
            <input type="checkbox" className="checkbox" checked={settings.showThumbnails} onChange={(e) => saveSetting(uid, 'showThumbnails', e.target.checked)} />
          </label>
        </div>

        <h2 className="section">Your data</h2>
        <button type="button" className="card settings-row" disabled={exporting || songs === null} onClick={() => void download()}>
          <span className="settings-card-title">{exporting ? 'Preparing export…' : 'Export all data (JSON)'}</span>
          <IconDownload />
        </button>
        {exportError && <p className="error small">Couldn't export: {exportError}</p>}

        <h2 className="section">Account</h2>
        {email && <p className="muted signed-in-as">Signed in as {email}</p>}
        <button type="button" className="btn wide-btn" onClick={() => void signOut(auth)}>Sign out</button>

        <p className="muted small settings-foot"><img src="/favicon.svg" width={16} height={16} alt="" /> Guitarbook</p>
      </div>
    </main>
  )
}
