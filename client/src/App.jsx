import React from 'react'
import { api } from './api.js'
import { getDeviceAuth, setDeviceAuth, buildLink, clearDeviceAuth } from './session.js'

export default function App() {
  const [tab, setTab] = React.useState('Connect')
  const [q, setQ] = React.useState('best waiver RB this week?')
  const [res, setRes] = React.useState('')
  const [swid, setSwid] = React.useState('')
  const [espnS2, setEspnS2] = React.useState('')
  const [link, setLink] = React.useState('')
  const [creds, setCreds] = React.useState(false)
  const [picks, setPicks] = React.useState(null)
  const [data, setData] = React.useState(null)
  const [authInfo, setAuthInfo] = React.useState(null)
  const [leagues, setLeagues] = React.useState(null)
  const [selected, setSelected] = React.useState([])
  const ask = async () => {
    const r = await api.tutor(q, { level: 'mixed' })
    setRes(r.answer || r.error)
  }
  React.useEffect(() => {
    try {
      const hash = window.location.hash
      if (hash.startsWith('#/connect')) {
        const u = new URL(hash.replace('#/connect',''), window.location.origin + '/')
        const s = u.searchParams.get('swid')
        const e = u.searchParams.get('espnS2')
        if (s) setSwid(s)
        if (e) setEspnS2(e)
        if (s || e) {
          setDeviceAuth({ swid: s||'', espnS2: e||'' })
          api.setEspnCreds(s||'', e||'').then(x=>setCreds(x.ok))
          setTab('Connect')
        }
      }
    } catch (e) {}
    api.espnCreds().then(x=>setCreds(x.has))
    api.nflPicks().then(x=>setPicks(x))
    const da = getDeviceAuth()
    if (da.swid) setSwid(da.swid)
    if (da.espnS2) setEspnS2(da.espnS2)
  }, [])
  const save = async () => {
    setDeviceAuth({ swid, espnS2 })
    await api.setEspnCreds(swid, espnS2)
    setCreds(true)
  }
  const clear = async () => {
    clearDeviceAuth()
    setSwid(''); setEspnS2('')
    await api.clearEspnCreds()
    setCreds(false)
  }
  const gen = () => {
    setLink(buildLink({ swid, espnS2 }))
  }
  const load = async (fn, ...args) => {
    const r = await fn(...args)
    setData(r)
  }
  const startAuth = async () => {
    const r = await api.authEspnStart()
    setAuthInfo(r)
    if (r.redirect) window.open(r.redirect, '_blank')
  }
  const completeAuth = async () => {
    const r = await api.authEspnCallback(swid, espnS2)
    setCreds(r.ok && r.has)
    setDeviceAuth({ swid, espnS2 })
  }
  const discover = async () => {
    const r = await api.authEspnComplete(swid, espnS2)
    setLeagues(r.leagues)
  }
  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])
  }
  return (
    <div style={{padding:16,fontFamily:'system-ui'}}>
      <h2>Frosty Fantasy Pros</h2>
      <div style={{marginBottom:12,flexWrap:'wrap'}}>
        {['Connect','Dashboard','Teams','AI'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{marginRight:8,padding:6,background:tab===t?'#ddd':'#eee'}}>{t}</button>
        ))}
      </div>
      {tab==='Connect' && (
        <div>
          <div>Sign in with ESPN/Disney (best-apps style)</div>
          <button onClick={startAuth} style={{padding:6,marginRight:4}}>Sign in with ESPN/Disney</button>
          <button onClick={discover} style={{padding:6,marginRight:4}}>Discover Leagues</button>
          {authInfo && (<pre style={{whiteSpace:'pre-wrap',fontSize:'12px'}}>{JSON.stringify(authInfo,null,2)}</pre>)}
          {leagues && (<div style={{marginTop:8,whiteSpace:'pre-wrap',fontSize:'12px'}}>{typeof leagues==='string'?leagues:JSON.stringify(leagues,null,2)}</div>)}
          <div style={{marginTop:8}}>Or paste SWID + espn_s2:</div>
          <input placeholder='SWID' value={swid} onChange={e=>setSwid(e.target.value)} style={{width:'40%',padding:6,marginRight:4}}/>
          <input placeholder='ESPN_S2' value={espnS2} onChange={e=>setEspnS2(e.target.value)} style={{width:'40%',padding:6,marginRight:4}}/>
          <button onClick={completeAuth} style={{padding:6,marginRight:4}}>Complete Login</button>
          <button onClick={save} style={{padding:6,marginRight:4}}>Save</button>
          <button onClick={clear} style={{padding:6,marginRight:4}}>Clear</button>
          <button onClick={gen} style={{padding:6}}>Gen Phone Link</button>
          <div>Creds on server: {creds ? 'yes' : 'no'}</div>
          {link && (<div style={{marginTop:8,wordBreak:'break-all'}}><small>{link}</small></div>)}
        </div>
      )}
      {tab==='Dashboard' && (
        <div>
          <button onClick={()=>load(api.nflPicks)}>Picks</button>
          <button onClick={()=>load(api.power)} style={{marginLeft:4}}>Power</button>
          <button onClick={()=>load(api.waivers)} style={{marginLeft:4}}>Waivers</button>
          <button onClick={()=>load(api.trades)} style={{marginLeft:4}}>Trades</button>
          <pre style={{whiteSpace:'pre-wrap',marginTop:8}}>{JSON.stringify(data||picks,null,2)}</pre>
        </div>
      )}
      {tab==='Teams' && (
        <div>
          <button onClick={()=>load(api.teams)}>Teams</button>
          <input placeholder='League ID' id='lid' style={{marginLeft:4,padding:4,width:'120px'}}/>
          <button onClick={()=>{const v=document.getElementById('lid').value; if(v) load(api.teams,v)}} style={{marginLeft:4}}>Teams by League</button>
          <button onClick={()=>{const v=document.getElementById('lid').value; if(v) load(api.rosters,v)}} style={{marginLeft:4}}>Rosters</button>
          <pre style={{whiteSpace:'pre-wrap',marginTop:8}}>{JSON.stringify(data,null,2)}</pre>
        </div>
      )}
      {tab==='AI' && (
        <div>
          <input value={q} onChange={e=>setQ(e.target.value)} style={{width:'80%',padding:8}}/>
          <button onClick={ask} style={{marginLeft:8,padding:8}}>Ask AI</button>
          <pre style={{whiteSpace:'pre-wrap',marginTop:12}}>{res}</pre>
        </div>
      )}
    </div>
  )
}
