import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

declare global {
  interface Window { __FIREBASE_WEB_API_KEY__?: string }
}

const root = createRoot(document.getElementById('root')!);
if (!window.__FIREBASE_WEB_API_KEY__) {
  root.render(<main className="boot"><h1>Foresight needs configuration.</h1><p>Set FIREBASE_WEB_API_KEY on the server and restart it to enable sign-in.</p></main>);
} else {
  import('./App.tsx').then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>);
  }).catch(() => {
    root.render(<main className="boot"><h1>Foresight could not open.</h1><p>Check the server configuration, then reload this page.</p></main>);
  });
}
