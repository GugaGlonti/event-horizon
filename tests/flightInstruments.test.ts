import { beforeEach, describe, expect, it } from 'vitest';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { getSpeedTrend } from '@/features/flight/flightInstruments';
import { useFlightStore } from '@/stores/flightStore';

describe('flight speed indicators', () => {
  beforeEach(() => {
    useFlightStore.setState(useFlightStore.getInitialState(), true);
  });

  it('uses speed change instead of held throttle, and settles at cruise or a stop', () => {
    expect(getSpeedTrend(20, 24.5, 0.1)).toBe('accelerating');
    expect(getSpeedTrend(180, 170.5, 0.1)).toBe('decelerating');
    expect(getSpeedTrend(180, 180, 0.1)).toBe('steady');
    expect(getSpeedTrend(0, 0, 0.1)).toBe('steady');
  });

  it('ignores small speed noise relative to the elapsed publication time', () => {
    expect(getSpeedTrend(60, 60.04, 0.1)).toBe('steady');
    expect(getSpeedTrend(60, 59.96, 0.1)).toBe('steady');
    expect(getSpeedTrend(60, 60.08, 0.2)).toBe('steady');
    expect(getSpeedTrend(60, 60.08, 0.1)).toBe('accelerating');
  });

  it.each([
    [0, 10, 0],
    [0, 10, -1],
    [0, 10, Number.NaN],
    [0, 10, Number.POSITIVE_INFINITY],
    [Number.NaN, 10, 0.1],
    [0, Number.POSITIVE_INFINITY, 0.1],
    [-1, 10, 0.1],
    [0, -1, 0.1],
  ])('keeps invalid samples on standby (%s, %s, %s)', (previous, speed, seconds) => {
    expect(getSpeedTrend(previous, speed, seconds)).toBe('steady');
  });

  it('shows deceleration into a stop, then acceleration and steady speed in reverse', () => {
    const controller = new FlightController(FLIGHT_CONFIG);
    const store = useFlightStore.getState();
    store.setInputMode('keyboard');
    for (let tick = 0; tick < 720; tick++)
      controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    store.publishTelemetry(controller.getTelemetry());
    expect(useFlightStore.getState().speedTrend).toBe('steady');
    const reverse = { ...createFlightInput(), brake: true, reverse: true };
    for (let tick = 0; tick < 12; tick++) controller.step(reverse, 1 / 120);
    store.publishTelemetry(controller.getTelemetry(), 0.1);
    expect(useFlightStore.getState().speedTrend).toBe('decelerating');
    for (let tick = 0; tick < 300; tick++) controller.step(reverse, 1 / 120);
    store.publishTelemetry(controller.getTelemetry());
    for (let tick = 0; tick < 12; tick++) controller.step(reverse, 1 / 120);
    store.publishTelemetry(controller.getTelemetry(), 0.1);
    expect(useFlightStore.getState().speedTrend).toBe('accelerating');
    for (let tick = 0; tick < 360; tick++) controller.step(reverse, 1 / 120);
    store.publishTelemetry(controller.getTelemetry());
    for (let tick = 0; tick < 12; tick++) controller.step(reverse, 1 / 120);
    store.publishTelemetry(controller.getTelemetry(), 0.1);
    expect(useFlightStore.getState().speedTrend).toBe('steady');
  });

  it('clears activity on pause/resume and discontinuous arrival or reset snapshots', () => {
    const store = useFlightStore.getState();
    const telemetry = store.telemetry;
    store.setInputMode('keyboard');
    store.publishTelemetry({ ...telemetry, speed: 45 }, 0.1);
    expect(useFlightStore.getState().speedTrend).toBe('accelerating');
    store.setInputMode(null);
    expect(useFlightStore.getState().speedTrend).toBe('steady');
    // Multiplayer still publishes while menus release controls.
    store.publishTelemetry({ ...telemetry, speed: 80 }, 0.1);
    expect(useFlightStore.getState().speedTrend).toBe('steady');
    store.setInputMode('keyboard');
    expect(useFlightStore.getState().speedTrend).toBe('steady');
    store.publishTelemetry({ ...telemetry, speed: 75 }, 0.1);
    expect(useFlightStore.getState().speedTrend).toBe('decelerating');
    store.publishTelemetry({ ...telemetry, speed: 0 });
    expect(useFlightStore.getState().speedTrend).toBe('steady');
  });
});
