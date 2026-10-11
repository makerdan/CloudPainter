import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminOverviewQueryKey,
  getListAdminAuditEventsQueryKey,
  getListAdminAccountsQueryKey,
  useGetAdminOverview,
  useListAdminAuditEvents,
  useListAdminAccounts,
  useSetAdminAccountStatus,
  type ListAdminAuditEventsParams,
  type ListAdminAccountsParams,
} from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import NotFound from '@/pages/not-found';
import './admin.css';

const PAGE_SIZE = 25;

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof candidate.status === 'number') return candidate.status;
  return typeof candidate.response?.status === 'number' ? candidate.response.status : undefined;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function dateTimeLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function AdminLoading() {
  return <main className="admin-shell" aria-label="Loading account administration">
    <div className="admin-topline"><span className="admin-brand-mark" aria-hidden="true">C</span><span>CloudPainter <b>·</b> Admin</span></div>
    <section className="admin-loading-panel" aria-live="polite">
      <div className="admin-skeleton admin-skeleton-title" />
      <div className="admin-skeleton admin-skeleton-copy" />
      <div className="admin-skeleton admin-skeleton-search" />
      {[0, 1, 2, 3].map(item => <div className="admin-skeleton admin-skeleton-row" key={item} />)}
    </section>
  </main>;
}

export default function AdminAccountsPage() {
  const { isLoaded, isSignedIn, sessionId, userId } = useAuth();
  const queryClient = useQueryClient();
  const previousSession = useRef<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [auditCursors, setAuditCursors] = useState<(string | null)[]>([null]);
  const [auditAction, setAuditAction] = useState<'' | 'suspend' | 'reactivate'>('');
  const [auditOutcome, setAuditOutcome] = useState<'' | 'pending' | 'succeeded' | 'failed'>('');
  const [confirming, setConfirming] = useState<{ id: string; name: string; next: 'active' | 'suspended' } | null>(null);
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (previousSession.current !== null && previousSession.current !== sessionId) {
      queryClient.removeQueries({
        predicate: query => {
          const key = query.queryKey[0];
          return key === '/api/admin/overview' || key === '/api/admin/accounts' || key === '/api/admin/audit-events';
        },
      });
      setDenied(false);
      setConfirming(null);
      setNotice('');
      setAuditCursors([null]);
    }
    previousSession.current = sessionId ?? null;
  }, [queryClient, sessionId]);

  const enabled = Boolean(isLoaded && isSignedIn && sessionId && !denied);
  const request = useMemo(() => ({
    headers: { 'X-Admin-Session': sessionId ?? '' },
    credentials: 'same-origin' as const,
  }), [sessionId]);
  const overviewKey = useMemo(() => [...getGetAdminOverviewQueryKey(), sessionId ?? ''], [sessionId]);
  const params = useMemo<ListAdminAccountsParams>(() => ({
    limit: PAGE_SIZE,
    offset,
    ...(search ? { query: search } : {}),
  }), [offset, search]);
  const listKey = useMemo(() => [...getListAdminAccountsQueryKey(params), sessionId ?? ''], [params, sessionId]);
  const auditCursor = auditCursors[auditCursors.length - 1] ?? null;
  const auditPageIndex = auditCursors.length - 1;
  const auditParams = useMemo<ListAdminAuditEventsParams>(() => ({
    limit: PAGE_SIZE,
    ...(auditCursor ? { cursor: auditCursor } : {}),
    ...(auditAction ? { action: auditAction } : {}),
    ...(auditOutcome ? { outcome: auditOutcome } : {}),
  }), [auditAction, auditCursor, auditOutcome]);
  const auditKey = useMemo(() => [...getListAdminAuditEventsQueryKey(auditParams), sessionId ?? ''], [auditParams, sessionId]);

  const overview = useGetAdminOverview({
    request,
    query: { enabled, queryKey: overviewKey, staleTime: 0, retry: false },
  });
  const page = useListAdminAccounts(params, {
    request,
    query: { enabled, queryKey: listKey, staleTime: 0, retry: false },
  });
  const auditPage = useListAdminAuditEvents(auditParams, {
    request,
    query: { enabled, queryKey: auditKey, staleTime: 0, retry: false },
  });
  const statusMutation = useSetAdminAccountStatus({ request });

  useEffect(() => {
    if (errorStatus(overview.error) === 401 || errorStatus(overview.error) === 404
      || errorStatus(page.error) === 401 || errorStatus(page.error) === 404
      || errorStatus(auditPage.error) === 401 || errorStatus(auditPage.error) === 404) setDenied(true);
  }, [overview.error, page.error, auditPage.error]);

  if (!isLoaded) return <AdminLoading />;
  if (!isSignedIn || !sessionId || denied
    || errorStatus(overview.error) === 401 || errorStatus(overview.error) === 404
    || errorStatus(page.error) === 401 || errorStatus(page.error) === 404
    || errorStatus(auditPage.error) === 401 || errorStatus(auditPage.error) === 404) return <NotFound />;

  const totalCount = page.data?.totalCount ?? 0;
  const maxOffset = Math.min(10_000, Math.max(0, (Math.ceil(totalCount / PAGE_SIZE) - 1) * PAGE_SIZE));
  const first = totalCount === 0 ? 0 : offset + 1;
  const last = Math.min(offset + (page.data?.accounts.length ?? 0), totalCount);
  const fatalError = [overview.error, page.error].find(error => errorStatus(error) !== 401 && errorStatus(error) !== 404);
  const auditFatalError = auditPage.error && errorStatus(auditPage.error) !== 401 && errorStatus(auditPage.error) !== 404
    ? auditPage.error
    : undefined;
  const auditTotalCount = auditPage.data?.totalCount ?? 0;
  const auditReady = auditPage.isFetchedAfterMount;
  const auditFirst = auditTotalCount === 0 ? 0 : auditPageIndex * PAGE_SIZE + 1;
  const auditLast = Math.min(auditFirst + (auditPage.data?.events.length ?? 0) - 1, auditTotalCount);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft.trim().slice(0, 100));
    setOffset(0);
    setNotice('');
  };

  const refreshAdminData = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListAdminAccountsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListAdminAuditEventsQueryKey() });
  };

  const confirmStatusChange = () => {
    if (!confirming || statusMutation.isPending) return;
    setNotice('');
    statusMutation.mutate({
      userId: confirming.id,
      data: { status: confirming.next },
    }, {
      onSuccess: () => {
        setNotice(confirming.next === 'suspended' ? 'Account suspended.' : 'Account reactivated.');
        setConfirming(null);
        refreshAdminData();
      },
      onError: error => {
        if (errorStatus(error) === 401 || errorStatus(error) === 404) {
          setDenied(true);
          return;
        }
        setNotice('The status could not be changed. Please retry.');
      },
    });
  };

  return <main className="admin-shell">
    <header className="admin-header">
      <div className="admin-topline">
        <span className="admin-brand-mark" aria-hidden="true">C</span>
        <span className="admin-brand-name">CloudPainter <b>·</b> <span>Admin</span></span>
      </div>
      <div className="admin-secure-label"><ShieldCheck size={15} strokeWidth={1.8} /> Restricted workspace</div>
    </header>

    <section className="admin-intro">
      <div>
        <p className="admin-eyebrow">ACCOUNT DIRECTORY <span> / </span> INTERNAL</p>
        <h1>Accounts, in focus.</h1>
        <p className="admin-intro-copy">A clear view of CloudPainter access, with only the controls you need.</p>
      </div>
      <div className="admin-total-card" data-testid="text-total-accounts">
        <span className="admin-total-label">All accounts</span>
        {overview.isLoading ? <span className="admin-number-skeleton" aria-label="Loading total" /> : <strong>{overview.data?.totalAccounts?.toLocaleString() ?? '—'}</strong>}
        <span className="admin-total-foot"><span className="admin-live-dot" /> Workspace total</span>
      </div>
    </section>

    <section className="admin-directory" aria-labelledby="directory-heading">
      <div className="admin-directory-head">
        <div>
          <h2 id="directory-heading">Account directory</h2>
          <p>Search by account name, email, or ID.</p>
        </div>
        <div className="admin-count">{page.isLoading ? 'Loading accounts' : `${totalCount.toLocaleString()} ${totalCount === 1 ? 'account' : 'accounts'}`}</div>
      </div>
      <form className="admin-search-form" onSubmit={submitSearch} role="search">
        <label className="admin-search-input">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search accounts</span>
          <input data-testid="input-account-search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)}
            maxLength={100} placeholder="Search accounts…" />
          {searchDraft && <button type="button" className="admin-clear-search" aria-label="Clear search" data-testid="button-clear-search"
            onClick={() => { setSearchDraft(''); setSearch(''); setOffset(0); }}><X size={15} /></button>}
        </label>
        <button type="submit" className="admin-search-button" data-testid="button-search">Search</button>
      </form>

      {notice && <div className="admin-notice" role="status" data-testid="status-admin-notice"><Check size={15} />{notice}</div>}

      {fatalError && <div className="admin-error" role="alert" data-testid="status-admin-error">
        <CircleAlert size={18} />
        <div><strong>Accounts could not be loaded.</strong><p>Check the connection and try again.</p></div>
        <button type="button" className="admin-retry" data-testid="button-retry-admin" onClick={() => { void overview.refetch(); void page.refetch(); }}>Retry</button>
      </div>}

      {!fatalError && page.isLoading && <div className="admin-table" aria-label="Loading accounts" aria-busy="true">
        <div className="admin-table-labels"><span>ACCOUNT</span><span>CREATED</span><span>STATUS</span><span /></div>
        {[0, 1, 2, 3, 4].map(item => <div className="admin-table-skeleton" key={item}><i /><i /><i /><i /></div>)}
      </div>}

      {!fatalError && !page.isLoading && page.data?.accounts.length === 0 && <div className="admin-empty" data-testid="status-account-empty">
        <span className="admin-empty-icon"><UserRound size={20} /></span>
        <strong>{search ? 'No matching accounts' : 'No accounts to show'}</strong>
        <p>{search ? 'Try a different name, email, or account ID.' : 'Accounts will appear here when available.'}</p>
      </div>}

      {!fatalError && !page.isLoading && (page.data?.accounts.length ?? 0) > 0 && <>
        <div className="admin-table" role="table" aria-label="CloudPainter accounts">
          <div className="admin-table-labels" role="row">
            <span role="columnheader">ACCOUNT</span><span role="columnheader">CREATED</span><span role="columnheader">STATUS</span><span role="columnheader" className="admin-action-heading">ACTION</span>
          </div>
          {page.data?.accounts.map(account => {
            const display = account.name?.trim() || account.email || 'Unnamed account';
            return <article className="admin-account-row" role="row" key={account.id} data-testid={`row-account-${account.id}`}>
              <div className="admin-account-cell" role="cell">
                <span className="admin-avatar" aria-hidden="true">{(display[0] || 'A').toLocaleUpperCase()}</span>
                <div className="admin-account-copy">
                  <strong data-testid={`text-account-name-${account.id}`}>{display}</strong>
                  <span className="admin-account-email" data-testid={`text-account-email-${account.id}`}>{account.email || 'No primary email'}</span>
                  <span className="admin-account-id" title={account.id}>ID · {account.id}</span>
                </div>
              </div>
              <div className="admin-created-cell" role="cell"><span className="admin-mobile-label">Created</span>{dateLabel(account.createdAt)}</div>
              <div role="cell"><span className={`admin-status ${account.status}`} data-testid={`status-account-${account.id}`}><i />{account.status === 'active' ? 'Active' : 'Suspended'}</span></div>
              <div className="admin-action-cell" role="cell">
                {account.id === userId && account.status === 'active'
                  ? <span className="admin-current-account">Current admin</span>
                  : <button type="button" className={`admin-row-action ${account.status === 'active' ? 'suspend' : 'reactivate'}`}
                  data-testid={`button-${account.status === 'active' ? 'suspend' : 'reactivate'}-${account.id}`}
                  disabled={statusMutation.isPending}
                  onClick={() => setConfirming({ id: account.id, name: display, next: account.status === 'active' ? 'suspended' : 'active' })}>
                  {account.status === 'active' ? 'Suspend' : 'Reactivate'}
                </button>}
              </div>
            </article>;
          })}
        </div>
        <footer className="admin-pagination">
          <span data-testid="text-pagination-range">{totalCount ? `Showing ${first}–${last} of ${totalCount.toLocaleString()}` : 'No accounts'}</span>
          <div className="admin-page-controls">
            <button type="button" className="admin-page-button" data-testid="button-previous-page" disabled={offset <= 0 || page.isFetching}
              onClick={() => setOffset(current => Math.max(0, current - PAGE_SIZE))}><ArrowLeft size={15} /> Previous</button>
            <span className="admin-page-index" data-testid="text-page-number">{totalCount ? `${Math.floor(offset / PAGE_SIZE) + 1} / ${Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}` : '—'}</span>
            <button type="button" className="admin-page-button" data-testid="button-next-page" disabled={offset >= maxOffset || page.isFetching}
              onClick={() => setOffset(current => Math.min(maxOffset, current + PAGE_SIZE))}>Next <ArrowRight size={15} /></button>
          </div>
        </footer>
      </>}
    </section>
    <section className="admin-directory admin-audit" aria-labelledby="audit-heading">
      <div className="admin-directory-head">
        <div>
          <h2 id="audit-heading">Account status history</h2>
          <p>Recent suspend and reactivate decisions.</p>
        </div>
        <div className="admin-count">{auditPage.isLoading ? 'Loading history' : `${auditTotalCount.toLocaleString()} ${auditTotalCount === 1 ? 'event' : 'events'}`}</div>
      </div>
      <div className="admin-audit-filters" aria-label="Filter account status history">
        <label>
          <span>Action</span>
          <select data-testid="select-audit-action" value={auditAction}
            onChange={event => {
              setAuditAction(event.target.value as typeof auditAction);
              setAuditCursors([null]);
            }}>
            <option value="">All actions</option>
            <option value="suspend">Suspend</option>
            <option value="reactivate">Reactivate</option>
          </select>
        </label>
        <label>
          <span>Outcome</span>
          <select data-testid="select-audit-outcome" value={auditOutcome}
            onChange={event => {
              setAuditOutcome(event.target.value as typeof auditOutcome);
              setAuditCursors([null]);
            }}>
            <option value="">All outcomes</option>
            <option value="pending">Pending</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>
      {auditFatalError && <div className="admin-error" role="alert" data-testid="status-audit-error">
        <CircleAlert size={18} />
        <div><strong>Account history could not be loaded.</strong><p>Check the connection and try again.</p></div>
        <button type="button" className="admin-retry" data-testid="button-retry-audit" onClick={() => { void auditPage.refetch(); }}>Retry</button>
      </div>}
      {!auditFatalError && (!auditReady || auditPage.isLoading) && <div className="admin-table-skeleton" aria-label="Loading account history" aria-busy="true">
        {[0, 1, 2, 3].map(item => <i key={item} />)}
      </div>}
      {!auditFatalError && auditReady && !auditPage.isLoading && auditPage.data?.events.length === 0 && <div className="admin-empty" data-testid="status-audit-empty">
        <span className="admin-empty-icon"><ShieldCheck size={20} /></span>
        <strong>{auditAction || auditOutcome ? 'No matching account status changes' : 'No account status changes yet'}</strong>
        <p>{auditAction || auditOutcome ? 'Try changing or clearing the selected filters.' : 'Suspends and reactivations will appear here.'}</p>
      </div>}
      {!auditFatalError && auditReady && !auditPage.isLoading
        && ((auditPage.data?.events.length ?? 0) > 0 || auditPageIndex > 0) && <>
        {(auditPage.data?.events.length ?? 0) > 0 && <div className="admin-audit-table" role="table" aria-label="Account status changes">
          <div className="admin-audit-labels" role="row">
            <span role="columnheader">ACTOR ID</span><span role="columnheader">TARGET ID</span>
            <span role="columnheader">ACTION</span><span role="columnheader">OUTCOME</span><span role="columnheader">TIME</span>
          </div>
          {auditPage.data?.events.map((event, index) => <div className="admin-audit-row" role="row"
            key={`${event.createdAt}:${event.actorId}:${event.targetId}:${index}`}>
            <span role="cell" className="admin-audit-id">{event.actorId}</span>
            <span role="cell" className="admin-audit-id">{event.targetId}</span>
            <span role="cell">{event.action === 'suspend' ? 'Suspend' : 'Reactivate'}</span>
            <span role="cell"><span className={`admin-audit-outcome ${event.outcome}`}>{event.outcome}</span></span>
            <time role="cell" dateTime={event.createdAt}>{dateTimeLabel(event.createdAt)}</time>
          </div>)}
        </div>}
        <footer className="admin-pagination">
          <span data-testid="text-audit-pagination-range">{auditTotalCount ? `Showing ${auditFirst}–${auditLast} of ${auditTotalCount.toLocaleString()}` : 'No events'}</span>
          <div className="admin-page-controls">
            <button type="button" className="admin-page-button" data-testid="button-audit-previous-page" disabled={auditPageIndex <= 0 || auditPage.isFetching}
              onClick={() => setAuditCursors(current => current.slice(0, -1))}><ArrowLeft size={15} /> Previous</button>
            <span className="admin-page-index" data-testid="text-audit-page-number">{auditTotalCount ? `${auditPageIndex + 1} / ${Math.max(1, Math.ceil(auditTotalCount / PAGE_SIZE))}` : '—'}</span>
            <button type="button" className="admin-page-button" data-testid="button-audit-next-page"
              disabled={!auditPage.data?.nextCursor || auditPage.isFetching}
              onClick={() => {
                const nextCursor = auditPage.data?.nextCursor;
                if (nextCursor) setAuditCursors(current => [...current, nextCursor]);
              }}>Next <ArrowRight size={15} /></button>
          </div>
        </footer>
      </>}
    </section>
    <footer className="admin-footer"><span>CloudPainter account administration</span><span>Account records are access-controlled</span></footer>

    {confirming && <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !statusMutation.isPending) setConfirming(null);
    }}>
      <section className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <span className={`admin-confirm-mark ${confirming.next}`}><ShieldCheck size={20} /></span>
        <button className="admin-modal-close" type="button" aria-label="Close confirmation" data-testid="button-close-confirmation"
          disabled={statusMutation.isPending} onClick={() => setConfirming(null)}><X size={18} /></button>
        <p className="admin-eyebrow">CONFIRM ACCOUNT CHANGE</p>
        <h2 id="confirm-title">{confirming.next === 'suspended' ? 'Suspend this account?' : 'Reactivate this account?'}</h2>
        <p id="confirm-description">{confirming.next === 'suspended'
          ? `${confirming.name} will lose access to CloudPainter until reactivated.`
          : `${confirming.name} will be able to access CloudPainter again.`}</p>
        <div className="admin-confirm-id">Account ID <span>{confirming.id}</span></div>
        {statusMutation.isError && <p className="admin-confirm-error" role="alert">The change did not go through. Please try again.</p>}
        <div className="admin-confirm-actions">
          <button type="button" className="admin-cancel-button" data-testid="button-cancel-confirmation" disabled={statusMutation.isPending} onClick={() => setConfirming(null)}>Cancel</button>
          <button type="button" className={`admin-confirm-button ${confirming.next}`} data-testid="button-confirm-status-change" disabled={statusMutation.isPending} onClick={confirmStatusChange}>
            {statusMutation.isPending ? 'Saving…' : confirming.next === 'suspended' ? 'Suspend account' : 'Reactivate account'}
          </button>
        </div>
      </section>
    </div>}
  </main>;
}
