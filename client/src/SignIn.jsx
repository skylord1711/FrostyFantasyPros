import React from 'react'
import { api } from './api.js'
import { setDeviceAuth, addLeague } from './session.js'

export default function SignIn({ onDone }) {
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState(null)
  const [leagues, setLeagues] = React.useState([])
  const [done, setDone] = React.useState(false)

  const submit = async () => {
    if (!username.trim() || !password) return
    setBusy(true); setMsg({ type: 'info', text: 'Signing in to ESPN…' }); setLeagues([]); setDone(false)
    let r
    try {
      r = await api.authLogin(username.trim(), password)
    } catch (e) {
      r = { ok: false, message: 'Network error contacting the server.' }
    }
    setPassword('')
    setBusy(false)
    if (r && r.ok) {
      setDeviceAuth({ swid: r.swid, espnS2: r.espnS2 })
      const list = r.leagues || []
      list.forEach(addLeague)
      setLeagues(list)
      setDone(true)
      setMsg({
        type: 'ok',
        text: list.length
          ? 'Signed in. Found ' + list.length + ' league' + (list.length > 1 ? 's' : '') + '.'
          : 'Signed in to ESPN. No leagues were found for this account this season.'
      })
      onDone && onDone(list)
    } else {
      setMsg({ type: 'err', text: (r && r.message) || 'ESPN sign-in failed.' })
    }
  }

  return (
    <div className="card">
      <h3>Sign in with ESPN</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Sign in with your ESPN/Disney username and password to load every league on your account.
        Your password is used once to authenticate with ESPN and is never stored.
      </p>
      <div className="row">
        <input
          placeholder="ESPN email or username"
          autoComplete="username"
          value={username}
          disabled={busy}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" style={{ width: '100%' }} disabled={busy || !username.trim() || !password} onClick={submit}>
          {busy ? 'Signing in…' : done ? 'Sign in again' : 'Sign in'}
        </button>
      </div>

      {msg && <div className={'msg ' + msg.type}>{msg.text}</div>}

      {done && leagues.length > 0 && (
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
    </div>
  )
}
