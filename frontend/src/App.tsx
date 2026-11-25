import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BootstrapDto, SessionState } from '@shared/api';
import { api, errorText, setToken, setUnauthenticatedHandler } from './api/client';
import { Menu, X } from 'lucide-react';
import calendar from 'react-useanimations/lib/calendar';
import edit from 'react-useanimations/lib/edit';
import inbox from 'react-useanimations/lib/inbox';
import list from 'react-useanimations/lib/list';
import logOut from 'react-useanimations/lib/logOut';
import settings from 'react-useanimations/lib/settings';
import users from 'react-useanimations/lib/users';
import { APP_NAME, ROLE_LABELS } from '@shared/constants';
import seal from './assets/seal.png';
import { AnimatedIcon, type AnimatedIconData } from './components/AnimatedIcon';
import { Centered, Loading } from './components/ui';
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
  const [menuOpen, setMenuOpen] = useState(false);

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
      <Centered>
        <h1>System not set up yet</h1>
        <p className="muted">The system owner runs setupDatabase once in the Apps Script editor. See the runbook.</p>
      </Centered>
    );
  }
  if (!state.me) return <LoginPage googleEmail={state.googleEmail} denied={state.denied} onSignedIn={load} />;
  if (!ctx) return <Loading />;

  const { me, has } = ctx;
  const hr = has('HR', 'ADMIN');
  const sections: [Page, string, boolean, number?][] = [
    ['mine', 'My leave', true],
    ['inbox', 'For my action', me.isSignatory || me.inboxCount > 0, me.inboxCount],
    ['all', 'All applications', hr],
    ['people', 'People', hr],
    ['setup', 'Setup', hr || has('REGIONAL_DIRECTOR') || (has('SUPERVISING_AO') && ctx.boot.settings.leaveCreditsMode === 'TRACKED')],
    ['signature', 'My signature', me.isSignatory],
  ];
  const visible = sections.filter((n) => n[2]);
  const current = visible.some((n) => n[0] === page) ? page : 'mine';

  const go = (k: Page) => {
    setPage(k);
    setMenuOpen(false);
  };
  const signOut = async () => {
    try {
      await api('api_signOut');
    } finally {
      setToken(null);
      void load();
    }
  };
  const initials = me.employee.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const roleLine = [me.employee.position || me.employee.roles.map((r) => ROLE_LABELS[r]).join(', '), me.employee.divisionName].filter(Boolean).join(' · ');

  const nav = (
    <nav aria-label="Main" className="side-nav">
      {visible.map(([k, label, , count]) => (
        <button key={k} className={current === k ? 'nav-item nav-active' : 'nav-item'} aria-current={current === k ? 'page' : undefined} onClick={() => go(k)}>
          <AnimatedIcon animation={NAV_ICONS[k]} size={18} />
          <span className="nav-label">{label}</span>
          {!!count && <span className="badge">{count}</span>}
        </button>
      ))}
    </nav>
  );
  const signOutLink = (
    <div className="side-foot">
      <button className="nav-item small" onClick={() => void signOut()}>
        <AnimatedIcon animation={logOut} size={16} />
        Sign out
      </button>
    </div>
  );

  return (
    <Session.Provider value={ctx}>
      <div className="shell">
        {state.environment !== 'production' && (
          <div className="env">{state.environment.toUpperCase()} environment · test data only. Records here are not official.</div>
        )}
        <div className="shell-body">
          <aside className="sidebar">
            <Brand />
            <div className="brand-rule" aria-hidden />
            {nav}
            {signOutLink}
          </aside>

          {menuOpen && (
            <div className="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
              <div className="drawer-scrim" onClick={() => setMenuOpen(false)} />
              <aside className="sidebar open">
                <div className="drawer-head">
                  <Brand />
                  <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close navigation">
                    <X size={20} aria-hidden />
                  </button>
                </div>
                <div className="brand-rule" aria-hidden />
                {nav}
                {signOutLink}
              </aside>
            </div>
          )}

          <div className="content">
            <header className="appbar">
              <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
                <Menu size={20} aria-hidden />
              </button>
              <p className="today">{todayLabel()}</p>
              <div className="who">
                <div className="who-text">
                  <b>{me.employee.fullName}</b>
                  <span>{me.isOicToday ? 'OIC, Regional Director today' : roleLine}</span>
                </div>
                <div className="avatar" title={me.employee.email} aria-label={`Signed in as ${me.employee.email}`}>
                  {initials}
                </div>
              </div>
            </header>
            <main>
              <div className="main-inner">
                {current === 'mine' && <MyLeavePage />}
                {current === 'inbox' && <InboxPage />}
                {current === 'all' && <AllApplicationsPage />}
                {current === 'people' && <PeoplePage />}
                {current === 'setup' && <SetupPage />}
                {current === 'signature' && <SignaturePage />}
              </div>
            </main>
          </div>
        </div>
      </div>
    </Session.Provider>
  );
}

const NAV_ICONS: Record<Page, AnimatedIconData> = {
  mine: calendar,
  inbox: inbox,
  all: list,
  people: users,
  setup: settings,
  signature: edit,
};

const todayLabel = () =>
  new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date());

function Brand() {
  return (
    <div className="side-brand">
      <img src={seal} alt="" />
      <span>{APP_NAME}</span>
    </div>
  );
}
