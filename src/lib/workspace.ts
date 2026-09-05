import { auth } from './firebase';

export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function request<T>(uid: string, path: string, body?: unknown, signal?: AbortSignal, method = 'POST'): Promise<T> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new DOMException('Account changed.', 'AbortError');
  const token = await user.getIdToken();
  if (auth.currentUser !== user || signal?.aborted) throw new DOMException('Account changed.', 'AbortError');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 65000);
  try {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    if (auth.currentUser !== user || signal?.aborted) throw new DOMException('Account changed.', 'AbortError');
    const data = await response.json().catch(() => { throw new Error('The server returned an unreadable response. Your draft is still here.'); });
    if (auth.currentUser !== user || signal?.aborted) throw new DOMException('Account changed.', 'AbortError');
    if (!response.ok) throw new RequestError(data.error || 'Unable to save. Your draft is still here; please retry.', response.status);
    return data as T;
  } catch (error) {
    if (signal?.aborted || auth.currentUser !== user) throw new DOMException('Account changed.', 'AbortError');
    if (controller.signal.aborted) throw new Error('The request timed out. Your draft is still here. Retry the save to confirm its status.');
    if (error instanceof TypeError) throw new Error('Could not reach the server. Check your connection and retry; your draft is still here.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
