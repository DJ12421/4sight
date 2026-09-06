import express from 'express';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import config from '../firebase-applet-config.json';
import { AIAction, Decision, InputError, PatternReport, evidenceRecord, identifier, ids, object, parseCommitment, parseDraft, text } from '../src/domain';
import { sampleDecisions } from '../src/sample';
import { JournalInteraction, ReflectionMode } from '../src/types';
import { generate } from './ai';
import { ConflictError, mutateDecision } from './mutations';

function getProjectId(): string {
  if (config.projectId && config.projectId.trim()) {
    return config.projectId.trim();
  }
  const envProject = process.env.GOOGLE_CLOUD_PROJECT;
  if (envProject?.startsWith('en-lang-')) {
    return `g${envProject}`;
  }
  return envProject || '';
}

function createMemoryStore(): Firestore {
  const records = new Map<string, unknown>();
  sampleDecisions.forEach(d => {
    records.set(`samples/decisions/${d.id}`, d);
  });
  const doc = (path: string) => ({
    path,
    get: async () => ({ exists: records.has(path), data: () => records.get(path) }),
    set: async (val: unknown) => { records.set(path, structuredClone(val)); },
    delete: async () => { records.delete(path); },
  });
  const collection = (path: string) => ({
    get: async () => ({
      docs: [...records.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([key, value]) => ({ id: key.slice(path.length + 1), data: () => value, exists: true })),
    }),
  });
  type Ref = ReturnType<typeof doc>;
  const db = {
    doc,
    collection,
    recursiveDelete: async (ref: Ref) => {
      for (const key of records.keys()) {
        if (key === ref.path || key.startsWith(`${ref.path}/`)) records.delete(key);
      }
    },
    runTransaction: async (fn: (tx: unknown) => unknown) => {
      const writes: (() => void)[] = [];
      const result = await fn({
        get: (ref: Ref) => ref.get(),
        getAll: (...refs: Ref[]) => Promise.all(refs.map(r => r.get())),
        set: (ref: Ref, value: unknown) => writes.push(() => records.set(ref.path, structuredClone(value))),
        delete: (ref: Ref) => writes.push(() => records.delete(ref.path)),
      });
      writes.forEach(write => write());
      return result;
    },
  };
  return db as unknown as Firestore;
}

const memoryDb = createMemoryStore();
const useAdminDb = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.USE_ADMIN_FIRESTORE);

function adminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = getProjectId();
  try {
    return initializeApp({ credential: applicationDefault(), projectId });
  } catch {
    return initializeApp({ projectId });
  }
}

function database(): Firestore {
  if (useAdminDb) {
    try {
      return getFirestore(adminApp(), config.firestoreDatabaseId || process.env.FIRESTORE_DATABASE_ID || '(default)');
    } catch {
      return memoryDb;
    }
  }
  return memoryDb;
}
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
type Dependencies = { db?: () => Firestore; verifyToken?: (token: string) => Promise<{ uid: string }>; generate?: typeof generate };
function journalTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new InputError('Add at most 8 tags.');
  return [...new Set(value.map(item => text(item, 'Tag', 30).toLowerCase()))];
}

export function createApp(deps: Dependencies = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Public Firebase browser configuration, injected at runtime so no key is
  // committed or baked into the image. This is never the Gemini API credential.
  app.get('/firebase-config.js', (_req, res) => {
    const key = process.env.FIREBASE_WEB_API_KEY || '';
    const configured = key && key !== process.env.GEMINI_API_KEY;
    res.status(configured ? 200 : 503).set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).type('application/javascript').send(
      `window.__FIREBASE_WEB_API_KEY__ = ${JSON.stringify(configured ? key : '')};`
    );
  });
  const db = deps.db || database;
  const verify = deps.verifyToken || ((token: string) => getAuth(adminApp()).verifyIdToken(token));
  const runAI = deps.generate || generate;
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', async (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'Sign in to continue.' });
    try {
      const decoded = await verify(match[1]);
      res.locals.uid = decoded.uid;
      next();
    } catch (err) {
      console.error('API token verification failed:', err instanceof Error ? err.message : err);
      res.status(401).json({ error: 'Your session expired. Sign in again.' });
    }
  });
  app.use('/api', express.json({ limit: '256kb' }));
  const route = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
    (req, res, next) => { Promise.resolve(fn(req, res)).catch(next); };
  const decisionRef = (uid: string, id: string) => db().doc(`users/${uid}/decisions/${id}`);
  async function sources(uid: string, selected: string[], providedSources?: Decision[]) {
    const docs = await Promise.all(selected.map(id => decisionRef(uid, id).get()));
    return docs.map((s, i) => {
      let d = s.exists ? (s.data() as Decision) : null;
      if (!d && providedSources) {
        const found = providedSources.find(item => item && item.id === selected[i]);
        if (found) d = found;
      }
      if (!d) {
        const sample = sampleDecisions.find(item => item.id === selected[i]);
        if (sample) d = sample;
      }
      if (!d) throw new ApiError(404, 'A selected source is unavailable. Update your selection.');
      if (!d.reviews.length) throw new InputError('Only reviewed decisions can be used as past evidence.');
      return d;
    });
  }
  async function consumeQuota(uid: string) {
    const ref = db().doc(`users/${uid}/usage/current`), now = Date.now();
    await db().runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      const day = new Date(now).toISOString().slice(0, 10), minute = Math.floor(now / 60000);
      const daily = old?.day === day ? Number(old.daily) : 0;
      const recent = old?.minute === minute ? Number(old.recent) : 0;
      if (daily >= 50 || recent >= 5) throw new ApiError(429, daily >= 50 ? 'Your 50 AI requests for today are used. You can still write, save, and review without AI.' : 'Please wait a minute before asking Gemini again.');
      tx.set(ref, { day, minute, daily: daily + 1, recent: recent + 1 });
    });
  }
  app.put('/api/decisions/:id', route(async (req, res) => {
    const id = identifier(req.params.id), ref = decisionRef(res.locals.uid, id), body = object(req.body);
    if (body.operation === 'draft') await sources(res.locals.uid, ids(object(body.draft).sourceIds), Array.isArray(body.sources) ? (body.sources as Decision[]) : undefined);
    const saved = await db().runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const decision = mutateDecision(id, snapshot.exists ? snapshot.data() as Decision : null, body, new Date().toISOString());
      tx.set(ref, decision);
      return decision;
    });
    return res.json(saved);
  }));
  app.delete('/api/decisions/:id', route(async (req, res) => {
    const id = identifier(req.params.id), ref = decisionRef(res.locals.uid, id);
    const expectedRevision = Number(req.query.revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new InputError('A valid decision revision is required. Reload and try again.');
    const reportRef = db().doc(`users/${res.locals.uid}/insights/latest`);
    await db().runTransaction(async tx => {
      const [snapshot, report] = await tx.getAll(ref, reportRef);
      if (snapshot.exists && Number(snapshot.data()?.revision ?? 0) !== expectedRevision) throw new ConflictError('This decision changed elsewhere. Reopen it before deleting.');
      tx.delete(ref);
      const reportSources = (report.data() as Partial<PatternReport> | undefined)?.sources;
      if (Array.isArray(reportSources) && reportSources.some(source => source.id === id)) tx.delete(reportRef);
    });
    return res.json({ success: true });
  }));
  app.post('/api/sample', route(async (_req, res) => {
    await db().runTransaction(async tx => {
      const refs = sampleDecisions.map(d => decisionRef(res.locals.uid, d.id));
      const snapshots = await tx.getAll(...refs);
      snapshots.forEach((snapshot, i) => { if (!snapshot.exists) tx.set(refs[i], sampleDecisions[i]); });
    });
    return res.json({ success: true });
  }));
  app.post('/api/journal', route(async (req, res) => {
    const body = object(req.body), id = identifier(body.id), ref = db().doc(`users/${res.locals.uid}/interactions/${id}`);
    const snapshot = await ref.get();
    const previous = snapshot.exists ? snapshot.data() as JournalInteraction : null;
    const modes: ReflectionMode[] = ['reflect', 'summarize', 'brainstorm', 'chat'];
    const mode = previous?.mode || body.mode;
    if (!modes.includes(mode as ReflectionMode)) throw new InputError('Choose a journal reflection style.');
    const turns = (previous?.turns || []).map(turn => ({ role: turn.role, text: text(turn.text, 'Journal message', 6000), timestamp: text(turn.timestamp || previous?.updatedAt || previous?.createdAt, 'Timestamp', 40) }));
    if (turns.some(turn => turn.role !== 'user' && turn.role !== 'model') || turns.length > 38) throw new InputError('This journal conversation is full. Start a new entry to continue.');
    const message = previous ? text(body.message, 'Follow-up', 4000) : '';
    const title = previous ? text(previous.title, 'Title', 150) : text(body.title, 'Title', 150);
    const prompt = previous ? text(previous.prompt, 'Journal entry', 6000) : text(body.entry, 'Journal entry', 6000);
    const response = previous ? text(previous.response, 'Gemini reflection', 6000) : '';
    const tags = previous?.tags || journalTags(body.tags);
    const payload = { mode, title, entry: prompt, initialReflection: response, turns, ...(message ? { message } : {}) };
    if (JSON.stringify(payload).length > 50000) throw new InputError('This journal conversation is too large. Start a new entry to continue.');
    await consumeQuota(res.locals.uid);
    let result;
    try { result = await runAI('journal', payload, []); }
    catch { throw new ApiError(502, 'Gemini could not reflect on this entry. Your writing is still here; try again shortly.'); }
    const now = new Date().toISOString();
    const saved: JournalInteraction = previous
      ? { ...previous, updatedAt: now, modelUsed: result.model, turns: [...turns, { role: 'user', text: message, timestamp: now }, { role: 'model', text: result.reply!, timestamp: now }] }
      : { id, userId: res.locals.uid, title, prompt, response: result.reply!, mode: mode as ReflectionMode, modelUsed: result.model, createdAt: now, updatedAt: now, tags, turns: [] };
    await db().runTransaction(async tx => {
      const current = await tx.get(ref);
      if (previous && (!current.exists || current.data()?.updatedAt !== previous.updatedAt)) throw new ConflictError('This journal entry changed elsewhere. Reload it before continuing.');
      if (!previous && current.exists) throw new ConflictError('This journal entry already exists.');
      tx.set(ref, saved);
    });
    return res.json(saved);
  }));
  app.delete('/api/journal/:id', route(async (req, res) => {
    const ref = db().doc(`users/${res.locals.uid}/interactions/${identifier(req.params.id)}`);
    await db().runTransaction(async tx => tx.delete(ref));
    return res.json({ success: true });
  }));
  app.put('/api/journal/:id/tags', route(async (req, res) => {
    const ref = db().doc(`users/${res.locals.uid}/interactions/${identifier(req.params.id)}`), tags = journalTags(object(req.body).tags);
    const saved = await db().runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new ApiError(404, 'Journal entry not found.');
      const entry = { ...snapshot.data() as JournalInteraction, tags, updatedAt: new Date().toISOString() };
      tx.set(ref, entry); return entry;
    });
    return res.json(saved);
  }));
  app.get('/api/export', route(async (_req, res) => {
    const root = `users/${res.locals.uid}`;
    const [journal, decisions, insight] = await Promise.all([
      db().collection(`${root}/interactions`).get(),
      db().collection(`${root}/decisions`).get(),
      db().doc(`${root}/insights/latest`).get(),
    ]);
    return res.json({
      exportedAt: new Date().toISOString(),
      journal: journal.docs.map(item => ({ ...item.data(), id: item.id })),
      decisions: decisions.docs.map(item => ({ ...item.data(), id: item.id })),
      insights: insight.exists ? insight.data() : null,
    });
  }));
  app.delete('/api/account-data', route(async (_req, res) => {
    const uid = res.locals.uid;
    const root = `users/${uid}`;
    const database = db();
    let deletedRecursively = false;
    if (typeof database.recursiveDelete === 'function') {
      try {
        await database.recursiveDelete(database.doc(root));
        deletedRecursively = true;
      } catch (err: unknown) {
        console.warn('recursiveDelete failed or lacked admin permissions, falling back to clearing user collections directly:', (err as Error)?.message || err);
      }
    }
    if (!deletedRecursively) {
      const collections = ['interactions', 'decisions', 'insights', 'usage'];
      for (const col of collections) {
        try {
          const snapshot = await database.collection(`${root}/${col}`).get();
          if (snapshot.docs && snapshot.docs.length) {
            for (let i = 0; i < snapshot.docs.length; i += 400) {
              const chunk = snapshot.docs.slice(i, i + 400);
              await Promise.all(chunk.map((d: { id: string; ref?: { delete: () => Promise<unknown> } }) =>
                d.ref ? d.ref.delete() : database.doc(`${root}/${col}/${d.id}`).delete()
              ));
            }
          }
        } catch (colErr) {
          console.warn(`Could not clear collection ${col}:`, colErr);
        }
      }
      try {
        await database.doc(root).delete();
      } catch {
        // Root user document might not exist directly
      }
    }
    return res.json({ success: true });
  }));
  app.post('/api/ai', route(async (req, res) => {
    const body = object(req.body), action = body.action as AIAction;
    if (!['chat', 'brief', 'challenge', 'review', 'patterns'].includes(action)) throw new InputError('Unknown AI action.');
    const selected = ids(body.sourceIds ?? []);
    const providedSources = Array.isArray(body.sources) ? (body.sources as Decision[]) : undefined;
    const evidence = await sources(res.locals.uid, selected, providedSources);
    const versions = body.sourceVersions ?? [];
    if (!Array.isArray(versions) || versions.length !== evidence.length || evidence.some((d, i) => versions[i]?.id !== d.id || versions[i]?.revision !== d.revision)) {
      throw new ConflictError('A selected source changed. Inspect the current preview before asking Gemini again.');
    }
    let payload: unknown;
    if (action === 'patterns') {
      if (evidence.length < 2) throw new InputError('Select at least two reviewed decisions to look for patterns.');
      if (evidence.some(d => d.sample) && evidence.some(d => !d.sample)) throw new InputError('Analyze fictional examples separately from personal decisions.');
      payload = { evidence: evidence.map(evidenceRecord) };
    } else if (action === 'review') {
      const decisionId = identifier(body.decisionId);
      const snapshot = await decisionRef(res.locals.uid, decisionId).get();
      const decision = snapshot.exists ? (snapshot.data() as Decision) : null;
      const draft = (!decision && body.draft && (body.draft as { id?: string }).id === decisionId) ? (body.draft as Decision) : decision;
      if (!draft) throw new ApiError(404, 'Decision not found.');
      if (!draft.commitment) throw new InputError('Commit to your decision before reviewing it.');
      payload = { title: text(draft.title, 'Title', 150), dilemma: text(draft.dilemma, 'Dilemma', 6000), commitment: parseCommitment(draft.commitment),
        outcome: text(body.outcome, 'Outcome'), lesson: text(body.lesson, 'Lesson', 2000, false) };
    } else {
      const draft = parseDraft(body.draft);
      payload = { ...draft, message: text(body.message ?? '', 'Message', 4000, action === 'chat'), evidence: evidence.map(evidenceRecord) };
    }
    if (JSON.stringify(payload).length > 100000) throw new InputError('This context is too large. Select fewer past decisions or shorten the conversation.');
    await consumeQuota(res.locals.uid);
    let result;
    try { result = await runAI(action, payload, selected); }
    catch { throw new ApiError(502, 'Gemini could not return a valid answer. Your writing is safe. Try again, or continue without AI.'); }
    if (action === 'patterns') {
      const report: PatternReport = { insights: result.insights || [], sources: evidence.map(d => ({ id: d.id, revision: d.revision })), model: result.model, createdAt: new Date().toISOString() };
      await db().runTransaction(async tx => {
        const snapshots = await tx.getAll(...selected.map(id => decisionRef(res.locals.uid, id)));
        if (snapshots.some((s, i) => !s.exists || s.data()?.revision !== evidence[i].revision)) throw new ConflictError('A source changed during analysis. Select the current records and try again.');
        tx.set(db().doc(`users/${res.locals.uid}/insights/latest`), report);
      });
      return res.json(report);
    }
    return res.json(result);
  }));
  app.post('/api/reflect', (_req, res) => res.status(410).json({ error: 'Use the Foresight decision workspace to start a conversation.' }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof InputError ? 400 : err instanceof ConflictError ? 409 : err instanceof ApiError ? err.status : err.type === 'entity.too.large' ? 413 : err instanceof SyntaxError ? 400 : 503;
    if (status === 503) console.error('Request failed', { category: err.name, message: err.message, stack: err.stack });
    res.status(status).json({ error: status === 413 ? 'This request is too large.' : status === 503 ? 'The service could not complete this request. Your draft is still available; retry shortly.' : err instanceof SyntaxError ? 'Invalid request body.' : err.message });
  });
  return app;
}
