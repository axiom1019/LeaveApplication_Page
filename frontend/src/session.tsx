import { createContext, useContext } from 'react';
import type { BootstrapDto, Me } from '@shared/api';

export interface SessionCtx {
  me: Me;
  boot: BootstrapDto;
  environment: string;
  privacy: { text: string; approved: boolean; version: string };
  /** Reloads the signed-in person (inbox count, roles). */
  refreshMe: () => void;
  has: (...roles: string[]) => boolean;
}

export const Session = createContext<SessionCtx | null>(null);
export function useSession(): SessionCtx {
  const s = useContext(Session);
  if (!s) throw new Error('No session');
  return s;
}
