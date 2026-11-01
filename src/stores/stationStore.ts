import { create } from 'zustand';
import type { StationReadout } from '@/engine/stations/telemetry';
export const useStationStore = create<{ readout: StationReadout | null }>(() => ({
  readout: null,
}));
