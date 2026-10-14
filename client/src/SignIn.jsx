import React from 'react'
import { api } from './api.js'
import { setDeviceAuth, addLeague } from './session.js'

const ACTIVE = ['starting', 'waiting_login', 'discovering']

export default function SignIn({ onDone }) {
  const [status, setStatus] = React.useState('idle')
  const [msg, setMsg] = React.useState(null)
  const [leagues, setLeagues] = React.useState([])
  const sessionRef = React.useRef('')
  const timer = React.useRef(null)

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  React.useEffect(() => () => stop(), [])

  const poll = async () => {
    const r = await api.authBrowserStatus(sessionRef.current)
    if (!r || !r.ok) return
    setStatus(r.status)
    if (r.message) {
      const type = r.status === 'done' ? 'ok' : (['error', 'expired', 'cancelled'].includes(r.status) ? 'err' : 'info')
      setMsg({ type, text: r.message })
    }
    if (r.status === 'done') {
      stop()
      if (r.creds && r.creds.swid && r.creds.espnS2) setDeviceAuth({ swid: r.creds.swid, espnS2: r.creds.espnS2 })
      const list = r.leagues || []
      list.forEach(addLeague)
      setLeagues(list)
      onDone && onDone(list)
    }
    if (['error', 'expired', 'cancelled'].includes(r.status)) stop()
  }

  const start = async () => {
    setStatus('starting'); setMsg({ type: 'info', text: 'Opening ESPN sign-in…' }); setLeagues([])
    const r = await api.authBrowserStart()
    if (!r || !r.ok) {
      setStatus('error')
      setMsg({ type: 'err', text: (r && r.message) || 'Could not start ESPN sign-in.' })
      return
    }
    sessionRef.current = r.sessionId || ''
    setStatus(r.status || 'starting')
    stop()
    timer.current = setInterval(poll, 2000)
  }

  const cancel = async () => {
    stop()
    try { await api.authBrowserCancel() } catch (e) {}
    setStatus('idle')
    setMsg({ type: 'info', text: 'Sign-in cancelled.' })
  }

  const active = ACTIVE.includes(status)

  return (
    <div className="card">
      <h3>Sign in with ESPN</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Sync every league on your ESPN/Disney account. A Chrome window opens where you sign in at ESPN —
        we never see your password. We then save your ESPN session cookies on this device and load your leagues.
      </p>

      {!active && status !== 'done' && (
        <button className="primary" style={{ width: '100%' }} onClick={start}>
          {status === 'error' || status === 'expired' || status === 'cancelled' ? 'Try again' : 'Sign in with ESPN'}
        </button>
      )}

      {active && (
        <div>
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="spinner" />
            <span className="grow">
              {status === 'waiting_login' ? 'Waiting for you to finish signing in…' : 'Working…'}
            </span>
            <button className="ghost" onClick={cancel}>Cancel</button>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Complete the ESPN/Disney login in the Chrome window that just opened. This panel updates on its own.
          </div>
        </div>
      )}

      {msg && <div className={'msg ' + msg.type}>{msg.text}</div>}

      {status === 'done' && leagues.length > 0 && (
        <div className="list" style={{ marginTop: 8 }}>
          {leagues.map((l) => (
            <div className="league" key={l.id}>
              <div className="avatar">🏈</div>
              <div className="grow">
                <div className="nm">{l.name}</div>
                <div className="meta">ID {l.id}{l.season ? ' · ' + l.season : ''}{l.teamCount ? ' · ' + l.teamCount + ' teams' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'done' && (
        <button className="ghost" style={{ marginTop: 8 }} onClick={() => { setStatus('idle'); setMsg(null); setLeagues([]) }}>
          Sign in again
        </button>
      )}
    </div>
  )
}
