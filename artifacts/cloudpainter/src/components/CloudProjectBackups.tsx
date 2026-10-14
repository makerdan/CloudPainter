import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  createProjectBackup as createAccountBackup,
  deleteProjectBackup,
  getProjectBackup,
  listProjectBackups,
  type ProjectBackupList,
} from "@workspace/api-client-react";
import { usePaletteAccount } from "./Account";
import {
  createProjectBackup,
  MAX_PROJECT_BACKUP_BYTES,
  type EditableProject,
} from "@/lib/projectBackup";

type CloudProjectBackupsProps = {
  project: EditableProject;
  open: boolean;
  onRestore: (backup: string) => Promise<boolean>;
};

export function CloudProjectBackups(props: CloudProjectBackupsProps) {
  const account = usePaletteAccount();
  if (!account.isLoaded) return <section className="cloud-project-backups" aria-label="Account sketch backups">
    <h3>Account backups</h3>
    <small role="status">Checking account status…</small>
  </section>;
  if (!account.userId || !account.sessionId) return <section className="cloud-project-backups" aria-label="Account sketch backups">
    <div className="cloud-project-backups-collapsed">
      <div><h3>Account backups</h3><small>Your sketches stay local until you choose to back them up.</small></div>
      <Link className="button button-small" href="/sign-in">Sign in</Link>
    </div>
  </section>;
  return <SignedInCloudProjectBackups
    key={`${account.userId}:${account.sessionId}`}
    {...props}
    userId={account.userId}
    sessionId={account.sessionId}
  />;
}

function SignedInCloudProjectBackups({
  project,
  open,
  onRestore,
  userId,
  sessionId,
}: CloudProjectBackupsProps & { userId: string; sessionId: string }) {
  const [data, setData] = useState<ProjectBackupList | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const pendingBackup = useRef<{ requestId: string; contents: string } | null>(null);
  const activeController = useRef<AbortController | null>(null);

  const request = useCallback(() => ({
    headers: { "X-Project-Session": sessionId },
    credentials: "same-origin" as const,
  }), [sessionId]);

  useEffect(() => {
    if (!open || !expanded) return;
    const controller = new AbortController();
    activeController.current = controller;
    setBusy(true);
    setError("");
    void listProjectBackups({ ...request(), signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(reason => {
      if (!controller.signal.aborted) {
        setError(errorMessage(reason, "Account backups could not load. Your local sketch is safe."));
        setData(null);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => {
      controller.abort();
      if (activeController.current === controller) activeController.current = null;
    };
  }, [open, expanded, request, refresh, userId]);

  useEffect(() => () => activeController.current?.abort(), []);

  const saveBackup = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const contents = createProjectBackup(project);
      if (!pendingBackup.current || pendingBackup.current.contents !== contents) {
        pendingBackup.current = { requestId: crypto.randomUUID(), contents };
      }
      await createAccountBackup({
        requestId: pendingBackup.current.requestId,
        backup: pendingBackup.current.contents,
      }, { ...request(), signal: activeController.current?.signal });
      pendingBackup.current = null;
      setConfirmBackup(false);
      setMessage("Sketch and reference photo backed up to your account. The browser copy is unchanged.");
      setRefresh(value => value + 1);
    } catch (reason) {
      setError(errorMessage(reason, "The account backup failed. Your sketch remains in this browser; retry when you are online."));
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (id: string) => {
    const controller = new AbortController();
    activeController.current = controller;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const backup = await getProjectBackup(id, { ...request(), signal: controller.signal });
      const restored = await onRestore(backup.backup);
      if (restored) {
        setMessage(`“${backup.title}” restored. Your previous sketch is saved in Saved sketches.`);
        setConfirmRestoreId(null);
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(errorMessage(reason, "The account backup could not be loaded. Your current sketch is unchanged."));
      }
    } finally {
      if (activeController.current === controller) activeController.current = null;
      setBusy(false);
    }
  };

  const removeBackup = async (id: string) => {
    const controller = new AbortController();
    activeController.current = controller;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deleteProjectBackup(id, { ...request(), signal: controller.signal });
      setConfirmDeleteId(null);
      setMessage("Account backup deleted. Your browser copy is unchanged.");
      setRefresh(value => value + 1);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(errorMessage(reason, "The account backup could not be deleted. Please retry."));
      }
    } finally {
      if (activeController.current === controller) activeController.current = null;
      setBusy(false);
    }
  };

  const storagePercent = data
    ? Math.min(100, Math.round(data.totalBytes / data.accountLimitBytes * 100))
    : 0;

  return <section className="cloud-project-backups" aria-labelledby="cloud-project-backups-heading">
    <div className="cloud-project-backups-collapsed">
      <div>
        <h3 id="cloud-project-backups-heading">Account backups</h3>
        <small>Sketches remain local until you choose to back them up.</small>
      </div>
      <button
        type="button"
        className="button button-small"
        aria-expanded={expanded}
        aria-controls="account-backup-management"
        data-testid="button-toggle-account-backups"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (!next) {
            setBusy(false);
            setConfirmBackup(false);
            setConfirmRestoreId(null);
            setConfirmDeleteId(null);
          }
        }}
        disabled={busy || !open}
      >
        {expanded ? "Hide" : "Manage"}
      </button>
    </div>
    {expanded && <div id="account-backup-management" className="cloud-project-backup-management">
    <div className="cloud-project-backups-heading">
      <div>
        <p>Only the backup you confirm is copied. Signing in alone never uploads a sketch.</p>
      </div>
      <button
        type="button"
        className="button button-primary"
        onClick={() => { setConfirmBackup(true); setMessage(""); setError(""); }}
        disabled={busy || !open}
        data-testid="button-start-account-backup"
      >
        Back up this sketch
      </button>
    </div>
    {confirmBackup && <div className="cloud-project-confirmation" role="group" aria-label="Confirm account backup">
      <p>This copies “{project.title}”, including its reference photo and editable layers, to your account. Your browser copy stays here too.</p>
      <button type="button" className="button button-primary" onClick={() => void saveBackup()} disabled={busy} data-testid="button-confirm-account-backup">
        {busy ? "Saving backup…" : "Confirm backup"}
      </button>
      <button type="button" className="button" onClick={() => setConfirmBackup(false)} disabled={busy}>Cancel</button>
    </div>}
    {data && <div className="cloud-project-backup-quota" role="status" data-testid="account-backup-quota">
      {data.backups.length} of 20 backups · about {formatBytes(data.totalBytes)} of {formatBytes(data.accountLimitBytes)} used ({storagePercent}%)
      <div className="cloud-project-backup-meter" aria-hidden="true"><span style={{ width: `${storagePercent}%` }} /></div>
      <small>Each backup is limited to 2 MB. Delete an older backup to free account space.</small>
    </div>}
    {busy && !confirmBackup && <p role="status">Loading account backups…</p>}
    {!busy && data?.backups.length === 0 && <p>No account backups yet. Your sketch will stay local until you choose Back up this sketch.</p>}
    {data && data.backups.length > 0 && <ul className="cloud-project-backup-list" aria-label="Saved account backups">
      {data.backups.map(backup => <li key={backup.id} data-testid={`account-backup-${backup.id}`}>
        <div className="cloud-project-backup-entry">
          <div>
            <strong>{backup.title}</strong>
            <small>{new Date(backup.createdAt).toLocaleString()} · {formatBytes(backup.sizeBytes)}</small>
          </div>
          <div className="cloud-project-backup-actions">
            <button type="button" className="button button-small" onClick={() => { setConfirmRestoreId(backup.id); setConfirmDeleteId(null); }} disabled={busy} data-testid={`button-restore-account-backup-${backup.id}`}>
              Restore
            </button>
            <button type="button" className="button button-small" onClick={() => { setConfirmDeleteId(backup.id); setConfirmRestoreId(null); }} disabled={busy} data-testid={`button-delete-account-backup-${backup.id}`}>
              Delete
            </button>
          </div>
        </div>
        {confirmRestoreId === backup.id && <div className="cloud-project-confirmation">
          <p>Restore “{backup.title}”? Your current sketch will be saved in Saved sketches first.</p>
          <button type="button" className="button button-primary" onClick={() => void restoreBackup(backup.id)} disabled={busy}>Confirm restore</button>
          <button type="button" className="button" onClick={() => setConfirmRestoreId(null)} disabled={busy}>Cancel</button>
        </div>}
        {confirmDeleteId === backup.id && <div className="cloud-project-confirmation">
          <p>Delete “{backup.title}” from your account? This does not delete the browser copy.</p>
          <button type="button" className="button button-danger" onClick={() => void removeBackup(backup.id)} disabled={busy}>Confirm delete</button>
          <button type="button" className="button" onClick={() => setConfirmDeleteId(null)} disabled={busy}>Cancel</button>
        </div>}
      </li>)}
    </ul>}
    {error && <p className="cloud-project-backup-error" role="alert" data-testid="account-backup-error">{error}</p>}
    {message && <p className="cloud-project-backup-message" role="status" data-testid="account-backup-message">{message}</p>}
    {!data && !busy && open && <button type="button" className="button button-small" onClick={() => setRefresh(value => value + 1)}>Retry loading backups</button>}
    <small className="cloud-project-backup-limit">Account storage is capped at 32 MB across 20 backups. The shared CloudPainter backup allowance is capped at 128 MB.</small>
    <span className="sr-only">Current project file limit: {formatBytes(MAX_PROJECT_BACKUP_BYTES)}.</span>
    </div>}
  </section>;
}

function formatBytes(value: number): string {
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(value % (1024 * 1024) ? 1 : 0)} MB`
    : `${Math.ceil(value / 1024)} KB`;
}

function errorMessage(error: unknown, fallback: string): string {
  const response = error as { status?: unknown; data?: { error?: unknown } };
  if (typeof response?.data?.error === "string") return response.data.error;
  if (response?.status === 401) return "Your session expired. Sign in again; your browser sketch is unchanged.";
  return fallback;
}
