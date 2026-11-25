import { useState } from 'react';
import { api, errorText, setToken } from '../api/client';
import photo from '../assets/login-panel.webp';
import seal from '../assets/seal.png';
import { Field } from '../components/ui';

/**
 * Sign-in. govmail users who are signed in to Google never see this (they are recognised).
 * Everyone else enters their registered email and gets a 6-digit code.
 */
export function LoginPage(props: { googleEmail: string; denied: boolean; onSignedIn: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('api_requestCode', { email });
      setStep('code');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api('api_verifyCode', { email, code });
      setToken(r.token);
      props.onSignedIn();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-photo" style={{ backgroundImage: `url(${photo})` }} role="img" aria-label="DHSUD Region 10 office entrance">
        <div className="cap">Department of Human Settlements and Urban Development · Region 10</div>
      </div>
      <div className="login-main">
        <div className="login-box">
          <img className="seal" src={seal} alt="DHSUD seal" />
          <div className="kicker">DHSUD Region 10</div>
          <h1>Online Application for Leave</h1>
          <p className="lead">File CSC Form No. 6 online, print it ready to sign, and follow its status.</p>

          {props.denied && (
            <div className="notice">
              <b>{props.googleEmail}</b> is not registered for this system. Ask HR to register you, or sign in below with the email address HR registered.
            </div>
          )}
          {err && (
            <div className="form-err" role="alert">
              {err}
            </div>
          )}

          {step === 'email' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Field label="Your registered email" hint="Staff with govmail: open this page while signed in to your dhsud.gov.ph Google account and you go straight in.">
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <button className="btn primary block" disabled={busy || !email}>
                {busy ? 'Sending…' : 'Email me a sign-in code'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <div className="notice info">If {email} is registered, a 6-digit code is on its way. It works for 10 minutes.</div>
              <Field label="Sign-in code">
                <input
                  type="text"
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </Field>
              <button className="btn primary block" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <div className="actions" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                <button type="button" className="btn" onClick={() => (setStep('email'), setCode(''))}>
                  Use another email
                </button>
                <button type="button" className="btn" onClick={() => void send()} disabled={busy}>
                  Send a new code
                </button>
              </div>
            </form>
          )}

          <div className="login-foot">
            Only people registered by HR can sign in. Need help? Contact the Administrative Division.
            <br />
            This version runs on Google Workspace for small-scale use.
          </div>
        </div>
      </div>
    </div>
  );
}
