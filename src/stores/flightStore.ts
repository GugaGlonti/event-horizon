import { create } from 'zustand';
import type { InputMode } from '@/engine/input/FlightInputManager';
import type { FlightTelemetry } from '@/engine/simulation/flightTypes';
import { getSpeedTrend, type SpeedTrend } from '@/features/flight/flightInstruments';

export type CameraMode = 'chase' | 'cockpit';
export type FlightPhase = 'ready' | 'flying' | 'paused';

interface FlightState {
  phase: FlightPhase;
  inputMode: InputMode | null;
  cameraMode: CameraMode;
  assistance: boolean;
  engineSound: boolean;
  rendererReady: boolean;
  notice: string | null;
  telemetry: FlightTelemetry;
  speedTrend: SpeedTrend;
  setInputMode: (mode: InputMode | null) => void;
  toggleCamera: () => void;
  toggleAssistance: () => void;
  setRendererReady: (ready: boolean) => void;
  setNotice: (notice: string) => void;
  publishTelemetry: (telemetry: FlightTelemetry, seconds?: number) => void;
}

export const useFlightStore = create<FlightState>()((set) => ({
  phase: 'ready',
  inputMode: null,
  cameraMode: 'chase',
  assistance: true,
  engineSound: true,
  rendererReady: false,
  notice: null,
  speedTrend: 'steady',
  telemetry: {
    speed: 0,
    throttle: 0,
    boostCharge: 1,
    boostReady: true,
    boosting: false,
    heading: 0,
    pitch: 0,
    assistance: true,
    distance: 0,
  },
  setInputMode: (inputMode) =>
    set((state) => ({
      inputMode,
      speedTrend: 'steady',
      phase: inputMode ? 'flying' : state.phase === 'ready' ? 'ready' : 'paused',
      ...(inputMode ? { notice: null } : {}),
    })),
  toggleCamera: () =>
    set((state) => ({ cameraMode: state.cameraMode === 'chase' ? 'cockpit' : 'chase' })),
  toggleAssistance: () => set((state) => ({ assistance: !state.assistance })),
  setRendererReady: (rendererReady) => set({ rendererReady }),
  setNotice: (notice) => set({ notice }),
  publishTelemetry: (telemetry, seconds = 0) =>
    set((state) => ({
      telemetry,
      speedTrend:
        state.phase === 'flying'
          ? getSpeedTrend(state.telemetry.speed, telemetry.speed, seconds)
          : 'steady',
    })),
}));
