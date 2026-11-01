import { create } from 'zustand';
import type { PlanetaryReadout } from '@/engine/planetary/telemetry';
export const usePlanetaryStore = create<{ readout: PlanetaryReadout | null }>(() => ({
  readout: null,
}));
