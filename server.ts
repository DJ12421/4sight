import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createApp } from './server/app';

async function start() {
  const app = createApp();
  if (process.env.NODE_ENV === 'production') {
    const root = path.resolve('dist');
    app.use(express.static(root));
    app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    app.use((await createServer({ server: { middlewareMode: true }, appType: 'spa' })).middlewares);
  }
  const server = app.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Foresight is listening.'));
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); });
}
start().catch(() => { console.error('Foresight could not start. Check server configuration.'); process.exitCode = 1; });
