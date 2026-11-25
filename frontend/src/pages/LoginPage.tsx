import { useState } from 'react';
import { api, errorText, setToken } from '../api/client';
import { Centered, Field } from '../components/ui';

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
    <Centered>
      <div className="kicker">DHSUD Region 10</div>
      <h1>Sign in</h1>
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
          <Field
            label="Your registered email"
            hint="Use your dhsud.gov.ph address or the personal email HR registered. We email you a 6-digit code."
          >
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

      <div className="login-foot">Only people registered by HR can sign in. Need help? Contact the Administrative Division.</div>
    </Centered>
  );
}
