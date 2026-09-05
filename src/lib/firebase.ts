import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

const app = initializeApp({ ...config, apiKey: window.__FIREBASE_WEB_API_KEY__ });
export const db = getFirestore(app, config.firestoreDatabaseId);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
export const signInWithGoogle = () => signInWithPopup(auth, provider);
export const logOut = () => signOut(auth);
