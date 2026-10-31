import { Quaternion, Vector3 } from 'three';
import { FlightInputManager } from '@/engine/input/FlightInputManager';
import { FixedStepLoop } from '@/engine/simulation/FixedStepLoop';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { FLIGHT_CONFIG, GAME_CONFIG } from '@/features/flight/config';
import { useFlightStore } from '@/stores/flightStore';

/** One player session. Owns adapters, but never owns camera or GPU resources. */
export class FlightSession {
  resetVersion = 0;
  readonly controller = new FlightController(FLIGHT_CONFIG);
  readonly position = new Vector3();
  readonly orientation = new Quaternion();
  private readonly previousPosition = new Vector3();
  private readonly currentPosition = new Vector3();
  private readonly previousOrientation = new Quaternion();
  private readonly currentOrientation = new Quaternion();
  private readonly loop = new FixedStepLoop(
    GAME_CONFIG.fixedStep,
    GAME_CONFIG.maxFrameTime,
    GAME_CONFIG.maxSteps,
  );
  private input = createFlightInput();
  private manager: FlightInputManager | null = null;
  private telemetryElapsed = 0;

  attach(target: HTMLElement) {
    this.manager?.dispose();
    const store = useFlightStore.getState();
    store.publishTelemetry(this.controller.getTelemetry());
    const manager = new FlightInputManager(
      target,
      {
        onMode: (mode) => {
          this.loop.reset();
          this.controller.copyTransform(this.currentPosition, this.currentOrientation);
          this.previousPosition.copy(this.currentPosition);
          this.previousOrientation.copy(this.currentOrientation);
          useFlightStore.getState().setInputMode(mode);
        },
        onCamera: store.toggleCamera,
        onAssistance: store.toggleAssistance,
        onError: store.setNotice,
      },
      GAME_CONFIG.input.mouseSensitivity,
      GAME_CONFIG.input.mouseReturnRate,
    );
    this.manager = manager;
    return () => {
      manager.dispose();
      if (this.manager === manager) this.manager = null;
    };
  }

  startMouse = () => {
    void this.manager?.requestMouse();
  };
  startKeyboard = () => {
    this.manager?.startKeyboard();
  };
  pause = () => {
    this.manager?.pause();
  };
  reset = () => {
    this.pause();
    this.controller.reset();
    this.controller.setAssistance(useFlightStore.getState().assistance);
    this.controller.copyTransform(this.currentPosition, this.currentOrientation);
    this.previousPosition.copy(this.currentPosition);
    this.previousOrientation.copy(this.currentOrientation);
    this.position.copy(this.currentPosition);
    this.orientation.copy(this.currentOrientation);
    this.loop.reset();
    this.telemetryElapsed = 0;
    this.resetVersion += 1;
    useFlightStore.getState().publishTelemetry(this.controller.getTelemetry());
  };
  markReady = () => {
    useFlightStore.getState().setRendererReady(true);
  };

  private step = (dt: number) => {
    this.previousPosition.copy(this.currentPosition);
    this.previousOrientation.copy(this.currentOrientation);
    this.controller.setAssistance(useFlightStore.getState().assistance);
    this.controller.step(this.input, dt);
    this.controller.copyTransform(this.currentPosition, this.currentOrientation);
  };

  advance(delta: number) {
    const state = useFlightStore.getState();
    if (state.phase !== 'flying') {
      this.loop.reset();
      return;
    }
    this.input = this.manager?.sample(delta) ?? this.input;
    const alpha = this.loop.advance(delta, this.step);
    this.position.lerpVectors(this.previousPosition, this.currentPosition, alpha);
    this.orientation.slerpQuaternions(this.previousOrientation, this.currentOrientation, alpha);
    this.telemetryElapsed += Math.min(delta, GAME_CONFIG.maxFrameTime);
    if (this.telemetryElapsed >= GAME_CONFIG.telemetryInterval) {
      this.telemetryElapsed %= GAME_CONFIG.telemetryInterval;
      state.publishTelemetry(this.controller.getTelemetry());
    }
  }
}
