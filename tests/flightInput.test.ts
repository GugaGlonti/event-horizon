import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlightInputManager } from '@/engine/input/FlightInputManager';

describe('flight input lifecycle', () => {
  let manager: FlightInputManager;
  let windowTarget: EventTarget;
  let doc: EventTarget & {
    pointerLockElement: HTMLElement | null;
    hidden: boolean;
    exitPointerLock: () => void;
  };
  let target: HTMLElement;
  const onMode = vi.fn();
  const onCamera = vi.fn();
  const onFlightMode = vi.fn();
  const onWeapon = vi.fn();
  const onError = vi.fn();

  function key(type: string, code: string, repeat = false) {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    windowTarget.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    windowTarget = new EventTarget();
    doc = Object.assign(new EventTarget(), {
      pointerLockElement: null as HTMLElement | null,
      hidden: false,
      exitPointerLock: () => {
        doc.pointerLockElement = null;
        doc.dispatchEvent(new Event('pointerlockchange'));
      },
    });
    target = {
      focus: vi.fn(),
      requestPointerLock: vi.fn(async () => {
        doc.pointerLockElement = target;
        doc.dispatchEvent(new Event('pointerlockchange'));
      }),
    } as unknown as HTMLElement;
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('document', doc);
    manager = new FlightInputManager(
      target,
      { onMode, onCamera, onFlightMode, onWeapon, onError },
      0.003,
      2.8,
    );
  });

  afterEach(() => {
    manager.dispose();
    vi.unstubAllGlobals();
  });

  it('ignores flight keys before launch and releases scrolling defaults after pause', () => {
    expect(key('keydown', 'KeyS').defaultPrevented).toBe(false);
    manager.startKeyboard();
    expect(key('keydown', 'KeyS').defaultPrevented).toBe(true);
    expect(manager.sample(0.01).brake).toBe(true);
    const wheel = new Event('wheel', { cancelable: true });
    doc.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    manager.pause();
    expect(manager.sample(0.01).brake).toBe(false);
    expect(key('keydown', 'KeyS').defaultPrevented).toBe(false);
    const pausedWheel = new Event('wheel', { cancelable: true });
    doc.dispatchEvent(pausedWheel);
    expect(pausedWheel.defaultPrevented).toBe(false);
  });

  it('allows HUD instrument scrolling in keyboard flight while captured mouse flight retains wheel control', async () => {
    manager.startKeyboard();
    const wheel = new Event('wheel', { cancelable: true });
    Object.defineProperty(wheel, 'target', { value: { closest: () => ({}) } });
    doc.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    await manager.requestMouse();
    const captured = new Event('wheel', { cancelable: true });
    Object.defineProperty(captured, 'target', { value: { closest: () => ({}) } });
    doc.dispatchEvent(captured);
    expect(captured.defaultPrevented).toBe(true);
  });

  it('selects weapons with number-row/numpad keys only while active, ignoring repeats/modifiers', () => {
    key('keydown', 'Digit2');
    expect(onWeapon).not.toHaveBeenCalled();
    manager.startKeyboard();
    for (const [code, slot] of [
      ['Digit1', 1],
      ['Digit2', 2],
      ['Digit3', 3],
      ['Digit4', 4],
      ['Numpad1', 1],
      ['Numpad2', 2],
      ['Numpad3', 3],
      ['Numpad4', 4],
    ] as const) {
      expect(key('keydown', code).defaultPrevented).toBe(true);
      expect(onWeapon).toHaveBeenLastCalledWith(slot);
    }
    expect(onWeapon).toHaveBeenCalledTimes(8);
    key('keydown', 'Digit3', true);
    windowTarget.dispatchEvent(
      Object.assign(new Event('keydown'), { code: 'Digit2', ctrlKey: true }),
    );
    expect(onWeapon).toHaveBeenCalledTimes(8);
    manager.pause();
    key('keydown', 'Digit1');
    expect(onWeapon).toHaveBeenCalledTimes(8);
  });

  it('maps S to braking and reverse, including while W and boost are held', () => {
    manager.startKeyboard();
    key('keydown', 'KeyS');
    expect(manager.sample(0.01)).toMatchObject({ throttle: 0, brake: true, reverse: true });
    key('keydown', 'KeyW');
    key('keydown', 'ShiftLeft');
    expect(manager.sample(0.01)).toMatchObject({
      throttle: 0,
      brake: true,
      reverse: true,
      boost: true,
    });
    key('keyup', 'KeyS');
    expect(manager.sample(0.01)).toMatchObject({
      throttle: 1,
      brake: false,
      reverse: false,
      boost: true,
    });
  });

  it.each(['KeyY', 'KeyZ', 'KeyR', 'KeyV'])(
    'leaves %s unbound instead of engaging reverse',
    (code) => {
      manager.startKeyboard();
      expect(key('keydown', code).defaultPrevented).toBe(false);
      expect(manager.sample(0.01).reverse).toBe(false);
    },
  );

  it('reads primary fire only while actively piloting and prevents active-flight scrolling', () => {
    expect(key('keydown', 'Space').defaultPrevented).toBe(false);
    manager.startKeyboard();
    key('keydown', 'KeyW');
    const before = { ...manager.sample(0.01) };
    expect(key('keydown', 'Space').defaultPrevented).toBe(true);
    expect(manager.firing).toBe(true);
    expect(manager.sample(0.01)).toEqual(before);
    expect(key('keyup', 'Space').defaultPrevented).toBe(true);
    expect(manager.firing).toBe(false);
    expect(manager.sample(0.01)).toEqual(before);
    key('keydown', 'Space');
    manager.pause();
    expect(manager.firing).toBe(false);
    expect(key('keydown', 'Space').defaultPrevented).toBe(false);
  });

  it('fires on a held left click in either input mode, excluding HUD controls and clearing on pause', async () => {
    const mouse = (type: string, source = target, button = 0) => {
      const event = Object.assign(new Event(type, { cancelable: true }), { button });
      Object.defineProperty(event, 'target', { value: source });
      doc.dispatchEvent(event);
    };
    mouse('mousedown');
    expect(manager.firing).toBe(false);
    manager.startKeyboard();
    mouse('mousedown', { tagName: 'BUTTON' } as HTMLElement);
    expect(manager.firing).toBe(false);
    mouse('mousedown', target, 2);
    expect(manager.firing).toBe(false);
    mouse('mousedown');
    expect(manager.firing).toBe(true);
    mouse('mouseup');
    expect(manager.firing).toBe(false);
    await manager.requestMouse();
    mouse('mousedown');
    expect(manager.firing).toBe(true);
    doc.exitPointerLock();
    expect(manager.firing).toBe(false);
    manager.startKeyboard();
    expect(manager.firing).toBe(false);
    mouse('mousedown');
    windowTarget.dispatchEvent(new Event('blur'));
    expect(manager.firing).toBe(false);
  });

  it('maps horizontal translation and clears it with fire on focus loss', () => {
    manager.startKeyboard();
    for (const code of ['KeyD', 'KeyR', 'KeyS', 'Space']) key('keydown', code);
    expect(manager.sample(0.01)).toMatchObject({ strafe: 1, lift: 0, reverse: true });
    expect(manager.firing).toBe(true);
    windowTarget.dispatchEvent(new Event('blur'));
    expect(manager.sample(0.01)).toMatchObject({ strafe: 0, lift: 0, reverse: false });
    expect(manager.firing).toBe(false);
  });

  it('handles simultaneous controls and does not repeat camera/flight-mode toggles', () => {
    manager.startKeyboard();
    key('keydown', 'KeyW');
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowLeft');
    key('keydown', 'KeyE');
    key('keydown', 'ShiftLeft');
    expect(manager.sample(0.01)).toMatchObject({
      throttle: 1,
      pitch: -1,
      yaw: 1,
      roll: -1,
      boost: true,
    });
    key('keydown', 'KeyC');
    key('keydown', 'KeyC', true);
    key('keydown', 'KeyF');
    expect(onCamera).toHaveBeenCalledTimes(1);
    expect(onFlightMode).toHaveBeenCalledTimes(1);
    key('keyup', 'KeyW');
    expect(manager.sample(0.01).throttle).toBe(0);
  });

  it.each([
    ['ArrowUp', { pitch: -1, yaw: 0, roll: 0 }],
    ['ArrowDown', { pitch: 1, yaw: 0, roll: 0 }],
    ['ArrowLeft', { pitch: 0, yaw: 0, roll: -1 }],
    ['ArrowRight', { pitch: 0, yaw: 0, roll: 1 }],
    ['KeyQ', { pitch: 0, yaw: -1, roll: 0 }],
    ['KeyE', { pitch: 0, yaw: 1, roll: 0 }],
  ] as const)('maps %s to its flight axis and clears it on release', (code, axes) => {
    manager.startKeyboard();
    key('keydown', code);
    expect(manager.sample(0.01)).toMatchObject(axes);
    key('keyup', code);
    expect(manager.sample(0.01)).toMatchObject({ pitch: 0, yaw: 0, roll: 0 });
  });

  it('cancels opposing yaw and roll keys independently and restores held input on release', () => {
    manager.startKeyboard();
    for (const code of ['ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE']) key('keydown', code);
    expect(manager.sample(0.01)).toMatchObject({ yaw: 0, roll: 0 });
    key('keyup', 'ArrowRight');
    key('keyup', 'KeyE');
    expect(manager.sample(0.01)).toMatchObject({ yaw: -1, roll: -1 });
    key('keyup', 'ArrowLeft');
    key('keyup', 'KeyQ');
    expect(manager.sample(0.01)).toMatchObject({ yaw: 0, roll: 0 });
  });

  it.each(['KeyW', 'KeyS'])('clears held %s on blur, visibility loss, and Escape', (code) => {
    for (const action of ['blur', 'hidden', 'escape']) {
      manager.startKeyboard();
      key('keydown', code);
      expect(manager.sample(0.01)).toMatchObject({
        throttle: Number(code === 'KeyW'),
        brake: code === 'KeyS',
        reverse: code === 'KeyS',
      });
      if (action === 'blur') windowTarget.dispatchEvent(new Event('blur'));
      if (action === 'hidden') {
        doc.hidden = true;
        doc.dispatchEvent(new Event('visibilitychange'));
      }
      if (action === 'escape') key('keydown', 'Escape');
      expect(manager.sample(0.01).throttle).toBe(0);
      expect(manager.sample(0.01).brake).toBe(false);
      expect(manager.sample(0.01).reverse).toBe(false);
      expect(onMode).toHaveBeenLastCalledWith(null);
    }
  });

  it('captures relative mouse motion and safely pauses when pointer lock is released', async () => {
    await manager.requestMouse();
    expect(onMode).toHaveBeenLastCalledWith('mouse');
    doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 100, movementY: -100 }));
    expect(manager.sample(0.01)).toMatchObject({ pitch: 0.3, yaw: 0.3 });
    doc.exitPointerLock();
    expect(onMode).toHaveBeenLastCalledWith(null);
    expect(manager.sample(0.01).pitch).toBe(0);
  });

  it('reports failed mouse capture without entering active flight', async () => {
    target.requestPointerLock = vi.fn().mockRejectedValue(new Error('denied'));
    await manager.requestMouse();
    expect(onError).toHaveBeenCalledOnce();
    expect(onMode).not.toHaveBeenCalledWith('mouse');
  });

  it('removes all event handling on disposal', () => {
    manager.startKeyboard();
    manager.dispose();
    onMode.mockClear();
    key('keydown', 'KeyC');
    doc.dispatchEvent(new Event('pointerlockchange'));
    windowTarget.dispatchEvent(new Event('blur'));
    expect(onCamera).not.toHaveBeenCalled();
    expect(onMode).not.toHaveBeenCalled();
  });

  it('releases a delayed pointer-lock grant after the input owner unmounts', async () => {
    let finishCapture = () => {};
    target.requestPointerLock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCapture = resolve;
        }),
    );
    const request = manager.requestMouse();
    manager.dispose();
    doc.pointerLockElement = target;
    finishCapture();
    await request;
    expect(doc.pointerLockElement).toBeNull();
  });
});
