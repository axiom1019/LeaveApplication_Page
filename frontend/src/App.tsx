import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BootstrapDto, SessionState } from '@shared/api';
import { api, errorText, setToken, setUnauthenticatedHandler } from './api/client';
import seal from './assets/seal.png';
import { Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { AllApplicationsPage, InboxPage, MyLeavePage } from './pages/lists';
import { PeoplePage } from './pages/PeoplePage';
import { SetupPage } from './pages/SetupPage';
import { SignaturePage } from './pages/SignaturePage';
import { Session, type SessionCtx } from './session';

type Page = 'mine' | 'inbox' | 'all' | 'people' | 'setup' | 'signature';

export function App() {
  const [state, setState] = useState<SessionState | null>(null);
  const [boot, setBoot] = useState<BootstrapDto | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState<Page>('mine');

  const load = useCallback(async () => {
    try {
      const s = await api('api_session');
      setState(s);
      if (s.me) setBoot(await api('api_bootstrap'));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setToken(null);
      void load();
    });
    void load();
  }, [load]);

  const ctx = useMemo<SessionCtx | null>(() => {
    if (!state?.me || !boot) return null;
    const roles = new Set<string>(state.me.employee.roles);
    if (state.me.isOwner) roles.add('ADMIN');
    return {
      me: state.me,
      boot,
      environment: state.environment,
      privacy: state.privacy,
      refreshMe: () => void load(),
      has: (...r: string[]) => r.some((x) => roles.has(x)),
    };
  }, [state, boot, load]);

  if (error) return <Loading error={error} />;
  if (!state) return <Loading />;
  if (!state.initialized) {
    return (
      <div className="spinner">
        <h2>Not set up yet</h2>
        <p className="muted">The system owner runs setupDatabase once in the Apps Script editor. See the runbook.</p>
      </div>
    );
  }
  if (!state.me) return <LoginPage googleEmail={state.googleEmail} denied={state.denied} onSignedIn={load} />;
  if (!ctx) return <Loading />;

  const { me, has } = ctx;
  const hr = has('HR', 'ADMIN');
  const nav: [Page, string, boolean, number?][] = [
    ['mine', 'My leave', true],
    ['inbox', 'For my action', me.isSignatory || me.inboxCount > 0, me.inboxCount],
    ['all', 'All applications', hr],
    ['people', 'People', hr],
    ['setup', 'Setup', hr || has('REGIONAL_DIRECTOR') || (has('SUPERVISING_AO') && ctx.boot.settings.leaveCreditsMode === 'TRACKED')],
    ['signature', 'My signature', me.isSignatory],
  ];
  const visible = nav.filter((n) => n[2]);
  const current = visible.some((n) => n[0] === page) ? page : 'mine';

  return (
    <Session.Provider value={ctx}>
      {state.environment !== 'production' && <div className="env">{state.environment.toUpperCase()}: test copy. Records here are not official.</div>}
      <header className="topbar">
        <div className="inner">
          <div className="brand">
            <img src={seal} alt="" />
            <div>
              <div className="t1">DHSUD Region 10</div>
              <div className="t2">Online Application for Leave</div>
            </div>
          </div>
          <div className="spacer" />
          <div className="who">
            <b>{me.employee.fullName}</b>
            {me.employee.email}
            {me.isOicToday && <div>OIC, Regional Director today</div>}
          </div>
          <button
            className="btn-link-light"
            onClick={async () => {
              try {
                await api('api_signOut');
              } finally {
                setToken(null);
                void load();
              }
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Sections">
        <div className="inner">
          {visible.map(([k, label, , count]) => (
            <button key={k} aria-current={current === k ? 'page' : undefined} onClick={() => setPage(k)}>
              {label}
              {!!count && <span className="badge">{count}</span>}
            </button>
          ))}
        </div>
      </nav>
      <main>
        {current === 'mine' && <MyLeavePage />}
        {current === 'inbox' && <InboxPage />}
        {current === 'all' && <AllApplicationsPage />}
        {current === 'people' && <PeoplePage />}
        {current === 'setup' && <SetupPage />}
        {current === 'signature' && <SignaturePage />}
      </main>
    </Session.Provider>
  );
}
