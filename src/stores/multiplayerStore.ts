import { create } from 'zustand';

function debugNumber(value: string | undefined, max: number) {
  return import.meta.env.DEV ? Math.max(0, Math.min(max, Number(value) || 0)) : 0;
}
export type ConnectionStatus =
  | 'offline'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'transferring'
  | 'error';
export const useMultiplayerStore = create<{
  status: ConnectionStatus;
  name: string;
  playerId: string;
  systemId: string;
  roomId: string;
  error: string | null;
  players: number;
  kills: number;
  deaths: number;
  rtt: number;
  delay: number;
  tickRate: number;
  fps: number;
  corrections: number;
  debug: boolean;
  latency: number;
  jitter: number;
  loss: number;
  markers: { id: string; name: string; x: number; y: number; distance: number; edge: boolean }[];
}>()(() => ({
  markers: [],
  status: 'offline',
  name: 'Pilot',
  playerId: '',
  systemId: '',
  roomId: '',
  error: null,
  players: 0,
  kills: 0,
  deaths: 0,
  rtt: 0,
  delay: 0,
  tickRate: 30,
  fps: 0,
  corrections: 0,
  debug: import.meta.env.DEV && import.meta.env.VITE_NETWORK_DEBUG === 'true',
  latency: debugNumber(import.meta.env.VITE_NETWORK_LATENCY_MS, 1000),
  jitter: debugNumber(import.meta.env.VITE_NETWORK_JITTER_MS, 1000),
  loss: debugNumber(import.meta.env.VITE_NETWORK_LOSS_PERCENT, 50),
}));
