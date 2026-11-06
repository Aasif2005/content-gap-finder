import { createContext, useCallback, useContext, useState } from 'react';
import { Button, Dialog, useToast } from '../components/ui/index.js';
import { deleteRun } from './api.js';
import { useRecentRuns } from './recentRuns.jsx';

/**
 * "Remove this report?": a small dialog over the current screen. Removing takes
 * the report out of THIS account's history only; the server keeps the stored copy
 * for a few hours so the same search can be answered from it. `useRemoveReport()`
 * returns `requestRemove({ runId, title, after })`; `after` runs once it is gone.
 */

const RemoveContext = createContext(() => {});
export const useRemoveReport = () => useContext(RemoveContext);

export function RemoveReportProvider({ children }) {
  const [target, setTarget] = useState(null);
  const requestRemove = useCallback((t) => setTarget(t), []);
  return (
    <RemoveContext.Provider value={requestRemove}>
      {children}
      <RemoveDialog target={target} onClose={() => setTarget(null)} />
    </RemoveContext.Provider>
  );
}

function RemoveDialog({ target, onClose }) {
  const toast = useToast();
  const { reload } = useRecentRuns();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteRun(target.runId);
      target.after?.(target.runId);
      reload();
      onClose();
      toast.success('Report removed.');
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      dismissible={!busy}
      title="Remove this report?"
      description={`“${target?.title ?? 'This report'}” leaves your reports. Running the same search again brings it back and uses one of your daily analyses.`}
      actions={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={remove} loading={busy}>Remove</Button>
        </>
      )}
    />
  );
}
