import { MathUtils } from 'three';
import type { WeaponSlot } from '@/engine/combat/combatTypes';
import { createFlightInput } from '@/engine/simulation/flightTypes';

export type InputMode = 'mouse' | 'keyboard';

interface InputCallbacks {
  onMode: (mode: InputMode | null) => void;
  onCamera: () => void;
  onAssistance: () => void;
  onWeapon: (slot: WeaponSlot) => void;
  onError: (message: string) => void;
}

const WEAPON_KEYS = new Map<string, WeaponSlot>([
  ['Digit1', 1],
  ['Digit2', 2],
  ['Digit3', 3],
  ['Digit4', 4],
  ['Numpad1', 1],
  ['Numpad2', 2],
  ['Numpad3', 3],
  ['Numpad4', 4],
]);
const FLIGHT_KEYS = new Set([
  ...WEAPON_KEYS.keys(),
  'KeyW',
  'KeyS',
  'KeyQ',
  'KeyE',
  'KeyC',
  'KeyF',
  'KeyA',
  'KeyD',
  'KeyR',
  'KeyV',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Escape',
]);

/** Browser adapter. Only active piloting installs keyboard/mouse listeners. */
export class FlightInputManager {
  private readonly target: HTMLElement;
  private readonly callbacks: InputCallbacks;
  private readonly sensitivity: number;
  private readonly returnRate: number;
  private readonly keys = new Set<string>();
  private readonly input = createFlightInput();
  private stickX = 0;
  private stickY = 0;
  private mode: InputMode | null = null;
  private disposed = false;
  private wantsMouse = false;
  private mouseFire = false;

  constructor(
    target: HTMLElement,
    callbacks: InputCallbacks,
    sensitivity: number,
    returnRate: number,
  ) {
    this.target = target;
    this.callbacks = callbacks;
    this.sensitivity = sensitivity;
    this.returnRate = returnRate;
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.pause);
  }

  requestMouse = async () => {
    if (this.disposed) return;
    this.wantsMouse = true;
    if (typeof this.target.requestPointerLock !== 'function') {
      this.onLockError();
      return;
    }
    try {
      await this.target.requestPointerLock();
      if (this.disposed && document.pointerLockElement === this.target) document.exitPointerLock();
    } catch {
      this.onLockError();
    }
  };

  startKeyboard = () => {
    if (!this.disposed) {
      this.pause();
      this.activate('keyboard');
    }
  };

  private activate(mode: InputMode) {
    this.clear();
    this.mode = mode;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.preventDefault, { passive: false });
    document.addEventListener('contextmenu', this.preventDefault);
    this.target.focus({ preventScroll: true });
    this.callbacks.onMode(mode);
  }

  pause = () => {
    const wasActive = this.mode !== null;
    this.wantsMouse = false;
    this.mode = null;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('wheel', this.preventDefault);
    document.removeEventListener('contextmenu', this.preventDefault);
    this.clear();
    if (document.pointerLockElement === this.target) document.exitPointerLock();
    if (wasActive) this.callbacks.onMode(null);
  };

  private clear() {
    this.keys.clear();
    this.mouseFire = false;
    this.stickX = 0;
    this.stickY = 0;
    Object.assign(this.input, createFlightInput());
  }

  private onLockChange = () => {
    if (document.pointerLockElement === this.target) {
      if (this.disposed || !this.wantsMouse) document.exitPointerLock();
      else this.activate('mouse');
    } else if (this.mode === 'mouse') this.pause();
  };

  private onLockError = () => {
    if (!this.disposed && this.wantsMouse) {
      this.pause();
      this.callbacks.onError(
        'Mouse capture is unavailable. Choose Keyboard flight and steer with the arrow keys.',
      );
    }
  };

  private onVisibility = () => {
    if (document.hidden) this.pause();
  };
  private preventDefault = (event: Event) => {
    event.preventDefault();
  };
  private onMouseMove = (event: MouseEvent) => {
    if (this.mode !== 'mouse') return;
    this.stickX = MathUtils.clamp(this.stickX + event.movementX * this.sensitivity, -1, 1);
    this.stickY = MathUtils.clamp(this.stickY - event.movementY * this.sensitivity, -1, 1);
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (!FLIGHT_KEYS.has(event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.pause();
      return;
    }
    const element = event.target as HTMLElement | null;
    if (
      element?.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName ?? '') ||
      (element?.tagName === 'BUTTON' && event.code === 'Space')
    )
      return;
    event.preventDefault();
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'KeyC') this.callbacks.onCamera();
    if (event.code === 'KeyF') this.callbacks.onAssistance();
    const weapon = WEAPON_KEYS.get(event.code);
    if (weapon) this.callbacks.onWeapon(weapon);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (FLIGHT_KEYS.has(event.code)) {
      event.preventDefault();
      this.keys.delete(event.code);
    }
  };

  get firing() {
    return this.mode !== null && (this.keys.has('Space') || this.mouseFire);
  }

  private onMouseDown = (event: MouseEvent) => {
    // Clickable HUD controls must not also fire a weapon. Pointer lock routes all clicks here.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
    const element = event.target as HTMLElement | null;
    if (
      document.pointerLockElement !== this.target &&
      element !== this.target &&
      element?.tagName !== 'CANVAS'
    )
      return;
    event.preventDefault();
    this.mouseFire = true;
  };

  private onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) this.mouseFire = false;
  };

  sample(dt: number) {
    const keys = this.keys;
    this.input.pitch = MathUtils.clamp(
      this.stickY + Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')),
      -1,
      1,
    );
    this.input.yaw = MathUtils.clamp(
      this.stickX + Number(keys.has('KeyE')) - Number(keys.has('KeyQ')),
      -1,
      1,
    );
    this.input.roll = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    this.input.throttle = Number(keys.has('KeyW') && !keys.has('KeyS'));
    this.input.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    this.input.brake = keys.has('KeyS');
    this.input.strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    this.input.lift = Number(keys.has('KeyR')) - Number(keys.has('KeyV'));
    this.input.reverse = keys.has('KeyS');
    const decay = Math.exp(-this.returnRate * Math.max(0, Math.min(dt, 0.1)));
    this.stickX *= decay;
    this.stickY *= decay;
    return this.input;
  }

  dispose() {
    this.disposed = true;
    this.pause();
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.pause);
  }
}
