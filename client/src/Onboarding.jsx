import React from 'react'
import { getLeagues, setOnboarded } from './session.js'
import SignIn from './SignIn.jsx'

export default function Onboarding({ onFinish, onLeaguesChange }) {
  const [step, setStep] = React.useState(0)
  const [count, setCount] = React.useState(getLeagues().length)

  const finish = () => {
    setOnboarded(true)
    onFinish && onFinish()
  }

  const onSignedIn = (list) => {
    setCount(getLeagues().length)
    onLeaguesChange && onLeaguesChange()
    if (list && list.length) setStep(2)
  }

  const steps = [
    <div key="s0">
      <div className="progress"><span className="on" /><span /><span /></div>
      <div style={{ fontSize: 44 }}>❄️</div>
      <div className="big">Frosty Fantasy Pros</div>
      <p className="muted">
        Your multi-league fantasy football co-pilot — rankings, trades, start/sit, waivers, matchups,
        power rankings and an AI assistant. FantasyPros, but better.
      </p>
      <button className="primary" style={{ width: '100%' }} onClick={() => setStep(1)}>Get started</button>
    </div>,

    <div key="s1">
      <div className="progress"><span className="on" /><span className="on" /><span /></div>
      <div className="big">Connect with ESPN</div>
      <p className="muted">
        Sign in with your ESPN/Disney account to sync every league you're in. A Chrome window opens for you
        to sign in at ESPN — we never see your password, only the session it creates.
      </p>
      <SignIn onDone={onSignedIn} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="ghost" onClick={() => setStep(0)}>Back</button>
        <button
          className="primary grow"
          disabled={count === 0}
          onClick={() => setStep(2)}
        >
          {count === 0 ? 'Sign in to continue' : 'Continue'}
        </button>
      </div>
    </div>,

    <div key="s2">
      <div className="progress"><span className="on" /><span className="on" /><span className="on" /></div>
      <div style={{ fontSize: 44 }}>✅</div>
      <div className="big">You're all set</div>
      <p className="muted">
        {count
          ? 'Synced ' + count + ' league' + (count > 1 ? 's' : '') + '. Open the app to see standings, teams and more.'
          : 'No leagues were found for that account.'}
      </p>
      <button className="primary" style={{ width: '100%' }} onClick={finish}>Enter Frosty Fantasy Pros</button>
    </div>
  ]

  return (
    <div className="onb">
      <div className="inner">{steps[step]}</div>
    </div>
  )
}
