import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ApplicationDetail, ApplicationSummary } from '@shared/api';
import { APPLICATION_STATUSES, STATUS_LABELS } from '@shared/constants';
import { formatLongDate } from '@shared/dates';
import { api } from '../api/client';
import { ApplicationModal } from '../components/ApplicationModal';
import { FileLeaveModal } from '../components/FileLeaveModal';
import { Loading, StatusPill, useLoad } from '../components/ui';
import { useSession } from '../session';

export function AppList(props: { items: ApplicationSummary[]; showApplicant?: boolean; empty: string; onOpen: (id: string) => void }) {
  if (!props.items.length) return <div className="empty">{props.empty}</div>;
  return (
    <ul className="list">
      {props.items.map((a) => (
        <li key={a.applicationId}>
          <button className="row-btn" onClick={() => props.onOpen(a.applicationId)}>
            <span>
              <span className="title">{props.showApplicant ? a.applicantName : a.leaveTypeLabel}</span>
              <span className="meta">
                {' '}
                · {a.inclusiveDates} · {a.workingDays} day{a.workingDays === 1 ? '' : 's'}
              </span>
              <div className="meta">
                {a.applicationId}
                {props.showApplicant ? ` · ${a.divisionName} · ${a.leaveTypeLabel}` : ''} · filed {formatLongDate(a.filedOn)}
              </div>
            </span>
            <span className="side">
              <StatusPill status={a.status} />
              {a.waitingFor && <div className="meta">{a.waitingFor}</div>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MyLeavePage() {
  const { me } = useSession();
  const list = useLoad(() => api('api_myApplications'));
  const [filing, setFiling] = useState(false);
  const [open, setOpen] = useState<{ id: string; justFiled?: boolean } | null>(null);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My leave</h1>
          <p>File leave, print the form for signing, and follow its status.</p>
        </div>
        <button className="btn primary" onClick={() => setFiling(true)} disabled={!me.canFile}>
          <Plus size={16} aria-hidden />
          File leave
        </button>
      </div>
      {!me.canFile && <div className="notice">{me.cannotFileReason}</div>}
      <div className="card">{list.data ? <AppList items={list.data} empty="You have not filed leave here yet." onOpen={(id) => setOpen({ id })} /> : <Loading error={list.error} />}</div>
      {filing && (
        <FileLeaveModal
          onClose={() => setFiling(false)}
          onFiled={(a: ApplicationDetail) => {
            setFiling(false);
            list.reload();
            setOpen({ id: a.applicationId, justFiled: true });
          }}
        />
      )}
      {open && <ApplicationModal applicationId={open.id} justFiled={open.justFiled} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}

export function InboxPage() {
  const list = useLoad(() => api('api_inbox'));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>For my action</h1>
          <p>Applications waiting for your signature. Sign the paper copy, or use E-sign when you are away.</p>
        </div>
      </div>
      <div className="card">{list.data ? <AppList showApplicant items={list.data} empty="Nothing is waiting for you." onOpen={setOpen} /> : <Loading error={list.error} />}</div>
      {open && <ApplicationModal applicationId={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}

export function AllApplicationsPage() {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const list = useLoad(() => api('api_listApplications', { status: status || undefined, query: q || undefined }), [status, q]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>All applications</h1>
          <p>Record paper signatures, file signed forms, and search past leave.</p>
        </div>
      </div>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(query);
        }}
      >
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input type="text" placeholder="Name, number or division" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      <div className="card">{list.data ? <AppList showApplicant items={list.data} empty="No applications match." onOpen={setOpen} /> : <Loading error={list.error} />}</div>
      {open && <ApplicationModal applicationId={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}
