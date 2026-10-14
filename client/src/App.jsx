import React from 'react'
import { api } from './api.js'
import {
  getDeviceAuth, hasDeviceAuth,
  getLeagues, removeLeague,
  isOnboarded
} from './session.js'
import Onboarding from './Onboarding.jsx'
import SignIn from './SignIn.jsx'

const TABS = ['Leagues', 'Standings', 'Teams', 'AI']

export default function App() {
  const [onboarded, setOnb] = React.useState(isOnboarded())
  const [tab, setTab] = React.useState('Leagues')
  const [leagues, setLeaguesState] = React.useState(getLeagues())
  const [activeId, setActiveId] = React.useState((getLeagues()[0] || {}).id || '')
  const [auth, setAuth] = React.useState(getDeviceAuth())

  // data state
  const [basics, setBasics] = React.useState(null)
  const [loading, setLoading] = React.useState(false)

  // AI state
  const [q, setQ] = React.useState('Who should I start this week?')
  const [res, setRes] = React.useState('')

  const refreshLeagues = () => setLeaguesState(getLeagues())

  React.useEffect(() => {
    if (!activeId && leagues.length) setActiveId(leagues[0].id)
  }, [leagues, activeId])

  // Load active league standings
  const activeLeague = leagues.find((l) => String(l.id) === String(activeId))
  React.useEffect(() => {
    if (!activeId) { setBasics(null); return }
    setLoading(true)
    const season = activeLeague?.season
    api.leagueBasics(activeId, season).then((r) => {
      setBasics(r && r.ok ? r.league : { error: (r && r.message) || 'Could not load league.' })
      setLoading(false)
    }).catch(() => { setBasics({ error: 'Network error.' }); setLoading(false) })
  }, [activeId, activeLeague?.season])

  const onSignedIn = (list) => {
    setAuth(getDeviceAuth())
    refreshLeagues()
    if (list && list[0]) setActiveId(String(list[0].id))
  }

  const ask = async () => {
    const r = await api.tutor(q, { level: 'mixed', league: activeLeague ? activeLeague.name : undefined })
    setRes(r.answer || r.error || 'No response.')
  }

  if (!onboarded) {
    return <Onboarding onFinish={() => setOnb(true)} onLeaguesChange={refreshLeagues} />
  }

  const teams = (basics && basics.teams) || []
  const standings = [...teams].sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor))

  return (
    <div className="app">
      <div className="hdr">
        <div className="brand"><span className="flake">❄</span> Frosty Fantasy Pros</div>
        <div className="row">
          <span className="muted"><span className={'dot ' + (hasDeviceAuth() ? 'on' : 'off')} />{hasDeviceAuth() ? 'ESPN linked' : 'Not linked'}</span>
        </div>
      </div>

      {leagues.length > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <select value={activeId} onChange={(e) => setActiveId(e.target.value)} style={{ maxWidth: 320 }}>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Leagues' && (
        <div>
          <SignIn onDone={onSignedIn} />

          <div className="card">
            <h3>Your leagues</h3>
            {leagues.length === 0 && <div className="muted">No leagues yet. Sign in with ESPN above to load them.</div>}
            <div className="list">
              {leagues.map((l) => (
                <div className="league" key={l.id}>
                  <div className="avatar">🏈</div>
                  <div className="grow">
                    <div className="nm">{l.name}</div>
                    <div className="meta">ID {l.id}{l.season ? ' · ' + l.season : ''}{l.teamCount ? ' · ' + l.teamCount + ' teams' : ''}</div>
                  </div>
                  <button className="ghost" onClick={() => { setActiveId(l.id); setTab('Standings') }}>Open</button>
                  <button className="ghost" onClick={() => { const list = removeLeague(l.id); setLeaguesState(list); if (String(activeId) === String(l.id)) setActiveId((list[0] || {}).id || '') }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'Standings' && (
        <div className="card">
          <h3>{activeLeague ? activeLeague.name : 'Standings'}</h3>
          {loading && <div className="muted">Loading…</div>}
          {!loading && basics && basics.error && <div className="msg err">{basics.error}</div>}
          {!loading && basics && !basics.error && standings.length === 0 && <div className="muted">No teams returned.</div>}
          {!loading && basics && !basics.error && standings.map((t, i) => (
            <div className="team" key={t.id}>
              <div className="rank">{i + 1}</div>
              {t.logo ? <img src={t.logo} alt="" /> : <div className="avatar">🏈</div>}
              <div className="nm">{t.name}</div>
              <div className="rec">{t.wins}-{t.losses}{t.ties ? '-' + t.ties : ''}</div>
              <div className="rec" style={{ width: 70, textAlign: 'right' }}>{Math.round(t.pointsFor)} PF</div>
            </div>
          ))}
          {!activeId && !loading && <div className="muted">Sign in with ESPN to load a league.</div>}
        </div>
      )}

      {tab === 'Teams' && (
        <div className="card">
          <h3>Teams {activeLeague ? '· ' + activeLeague.name : ''}</h3>
          {loading && <div className="muted">Loading…</div>}
          {!loading && teams.length === 0 && <div className="muted">No teams loaded. Sign in with ESPN in the Leagues tab.</div>}
          {!loading && teams.map((t) => (
            <div className="team" key={t.id}>
              {t.logo ? <img src={t.logo} alt="" /> : <div className="avatar">🏈</div>}
              <div className="nm">{t.name}</div>
              <div className="rec">{t.wins}-{t.losses}{t.ties ? '-' + t.ties : ''}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'AI' && (
        <div className="card">
          <h3>Frosty AI</h3>
          <div className="row">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask() }} />
            <button className="primary" onClick={ask}>Ask</button>
          </div>
          {res && <pre style={{ marginTop: 12 }}>{res}</pre>}
        </div>
      )}
    </div>
  )
}
