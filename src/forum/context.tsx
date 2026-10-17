import { createContext, useContext, useState } from 'react';
import { api, type RecordData } from './client';

export const ForumContext = createContext<{ bootstrap: RecordData; revision: number; refresh: () => void; navigate: (view: string, values?: Record<string,string|number>) => void; notice: (value: string) => void }>({ bootstrap: {}, revision: 0, refresh() {}, navigate() {}, notice() {} });
export const useForum = () => useContext(ForumContext);
export function useMutation() {
  const forum = useForum(), [busy,setBusy] = useState(false), [error,setError] = useState('');
  async function run(action: string, data: unknown, success?: string, refresh = true) {
    if (busy) return null;
    setBusy(true); setError('');
    try { const result = await api(action,data); if (success) forum.notice(success); if (refresh) forum.refresh(); return result; }
    catch (error) { setError((error as Error).message); return null; } finally { setBusy(false); }
  }
  return { run,busy,error,setError };
}
