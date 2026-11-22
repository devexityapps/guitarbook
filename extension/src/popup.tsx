import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { libraryUrl } from './config'
import './popup.css'

type Page = { url: string; title: string } | 'unsavable' | null

const isWebUrl = (url: string | undefined) => !!url && /^https?:\/\//i.test(url)

function usePage(): Page {
  const [page, setPage] = useState<Page>(null)
  useEffect(() => {
    // With activeTab, url and title are readable once the user has clicked the icon (or used the shortcut).
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setPage(tab && isWebUrl(tab.url) ? { url: tab.url!, title: tab.title ?? '' } : 'unsavable')
    }, () => setPage('unsavable'))
  }, [])
  return page
}

const openLibrary = () => {
  void chrome.tabs.create({ url: libraryUrl() })
  window.close()
}

function Popup() {
  const page = usePage()
  return (
    <div className="popup">
      <header className="head">
        <img src="icons/icon-32.png" width={24} height={24} alt="" />
        <span className="name">Guitarbook</span>
      </header>
      <main className="body">
        {page === null ? null : page === 'unsavable' ? (
          <>
            <h1>Guitarbook can't save this page.</h1>
            <p className="muted">Browser pages like this one (settings, new tab, the Web Store) can't be saved. Go to the lesson or tab you want to keep and click the icon there.</p>
          </>
        ) : (
          <>
            <div className="label">Page title</div>
            <p className="value">{page.title || '(no title)'}</p>
            <div className="label">URL</div>
            <p className="value url">{page.url}</p>
          </>
        )}
      </main>
      <footer className="foot">
        <button className="btn primary" onClick={openLibrary}>Open library</button>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Popup /></StrictMode>)
