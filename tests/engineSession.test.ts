import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

let windowTarget: EventTarget;
let documentTarget: EventTarget & { hidden: boolean; pointerLockElement: HTMLElement | null };
const cleanups: (() => void)[] = [];
function setup() {
  const session = new FlightSession();
  const update = vi.spyOn(session.engineAudio, 'update').mockImplementation(() => {});
  const unlock = vi.spyOn(session.engineAudio, 'unlock').mockImplementation(() => {});
  const stop = vi.spyOn(session.engineAudio, 'stop');
  const dispose = vi.spyOn(session.engineAudio, 'dispose');
  cleanups.push(session.attach({ focus: vi.fn() } as unknown as HTMLElement));
  session.markReady();
  return { session, update, unlock, stop, dispose };
}
function key(type: string, code: string) {
  windowTarget.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
}
beforeEach(() => {
  useFlightStore.setState(useFlightStore.getInitialState(), true);
  useExplorationStore.setState(useExplorationStore.getInitialState(), true);
  windowTarget = new EventTarget();
  documentTarget = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null as HTMLElement | null,
    exitPointerLock: vi.fn(),
  });
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', documentTarget);
  vi.stubGlobal('AudioContext', undefined);
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('engine audio session boundaries', () => {
  it('passes actual throttle/boost/brake and camera state without publishing frame-rate stores', () => {
    const { session, update, unlock } = setup();
    session.startKeyboard();
    expect(unlock).toHaveBeenCalledOnce();
    key('keydown', 'KeyW');
    key('keydown', 'ShiftLeft');
    session.advance(0.1);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestedThrottle: 1,
        throttle: session.controller.enginePower,
        boosting: true,
        braking: false,
      }),
      0.1,
      true,
    );
    key('keyup', 'KeyW');
    key('keyup', 'ShiftLeft');
    key('keydown', 'KeyS');
    useFlightStore.getState().toggleCamera();
    session.advance(0.1);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestedThrottle: 0,
        boosting: false,
        braking: true,
        cockpit: true,
      }),
      0.1,
      true,
    );
  });

  it('stops on blur/visibility, maps, mute, reset, renderer failure and teardown', () => {
    const { session, update, stop, dispose } = setup();
    session.startKeyboard();
    windowTarget.dispatchEvent(new Event('blur'));
    expect(stop).toHaveBeenCalled();
    session.advance(0.1);
    expect(update.mock.lastCall?.[2]).toBe(false);
    session.startKeyboard();
    documentTarget.hidden = true;
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(useFlightStore.getState().phase).toBe('paused');
    documentTarget.hidden = false;
    session.startKeyboard();
    session.exploration.openMap('local');
    session.advance(0.1);
    expect(update.mock.lastCall?.[2]).toBe(false);
    session.exploration.closeMap();
    session.startKeyboard();
    session.toggleEngineSound();
    session.advance(0.1);
    expect(useFlightStore.getState().engineSound).toBe(false);
    expect(update.mock.lastCall?.[2]).toBe(false);
    session.reset();
    expect(useFlightStore.getState().engineSound).toBe(false);
    session.toggleEngineSound();
    session.startKeyboard();
    session.rendererFailed();
    session.advance(0.1);
    expect(update.mock.lastCall?.[2]).toBe(false);
    cleanups.pop()?.();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('unlocks in the jump gesture, stays silent in transit and restores engines on arrival', async () => {
    const { session, update, unlock } = setup();
    session.exploration.selectDestination('vesper');
    expect(session.exploration.beginJump()).toBe(true);
    expect(unlock).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(session.exploration.jump.prepared).toBe(true));
    session.advance(1 / 60);
    expect(update.mock.lastCall?.[2]).toBe(false);
    for (let frame = 0; frame < 700; frame++) {
      session.exploration.markArrivalReady(session.exploration.world.definition.id);
      session.advance(1 / 60);
    }
    expect(session.exploration.world.definition.id).toBe('vesper');
    expect(useFlightStore.getState().phase).toBe('flying');
    expect(update.mock.lastCall?.[2]).toBe(true);
  });
});
