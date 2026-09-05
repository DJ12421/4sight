export type ReflectionMode = 'reflect' | 'summarize' | 'brainstorm' | 'chat';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface JournalInteraction {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  response: string;
  mode: ReflectionMode;
  modelUsed?: string;
  createdAt: string;
  updatedAt: string;
  turns?: ChatTurn[];
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type SaveStatus = 'idle' | 'submitting' | 'saving' | 'saved' | 'error';
