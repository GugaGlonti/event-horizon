import { Quaternion, Vector3 } from 'three';
import { FlightInputManager } from '@/engine/input/FlightInputManager';
import { FixedStepLoop } from '@/engine/simulation/FixedStepLoop';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { RenderOrigin } from '@/engine/world/RenderOrigin';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { ExplorationSession } from '@/features/exploration/ExplorationSession';
import { FLIGHT_CONFIG, GAME_CONFIG } from '@/features/flight/config';
import { HyperspaceFlight, JUMP_MOTION } from '@/features/flight/HyperspaceFlight';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

/** One player session. Logical poses stay in system coordinates; GPU poses use renderOrigin. */
export class FlightSession {
  resetVersion = 0;
  readonly controller = new FlightController(FLIGHT_CONFIG);
  readonly position = new Vector3();
  readonly renderPosition = new Vector3();
  readonly origin = new RenderOrigin();
  readonly orientation = new Quaternion();
  readonly exploration: ExplorationSession;
  readonly journey = new HyperspaceFlight();
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

  constructor() {
    this.exploration = new ExplorationSession({
      onPause: this.pause,
      onDepart: (direction) => this.journey.begin(this.position, this.orientation, direction),
      onCommit: (system) => {
        this.journey.arrive(system);
        this.journey.sample(this.exploration.jump, this.position, this.orientation);
        this.controller.relocate(this.position, this.orientation);
        this.snapPose(false);
        useFlightStore.getState().publishTelemetry(this.controller.getTelemetry());
      },
      onRestore: () => {
        this.journey.finish(this.position, this.orientation);
        this.controller.relocate(this.position, this.orientation, JUMP_MOTION.exitSpeed);
        this.snapPose(false);
        useFlightStore.getState().publishTelemetry(this.controller.getTelemetry());
        this.startKeyboard();
      },
      onError: (message) => {
        if (this.journey.active) {
          this.journey.active = false;
          this.controller.relocate(this.position, this.orientation);
          this.snapPose(false);
          useFlightStore.getState().publishTelemetry(this.controller.getTelemetry());
        }
        useFlightStore.getState().setNotice(message);
      },
    });
    this.arrive(this.exploration.world);
    this.exploration.syncPose(this.position, this.orientation);
  }

  private arrive(system: SystemRuntime) {
    const arrival = system.arrival();
    this.currentPosition.fromArray(arrival.position);
    this.currentOrientation.fromArray(arrival.orientation);
    this.controller.relocate(this.currentPosition, this.currentOrientation);
    this.snapPose();
  }

  private snapPose(resetCamera = true) {
    this.controller.copyTransform(this.currentPosition, this.currentOrientation);
    this.previousPosition.copy(this.currentPosition);
    this.previousOrientation.copy(this.currentOrientation);
    this.position.copy(this.currentPosition);
    this.orientation.copy(this.currentOrientation);
    this.origin.update(this.position);
    this.origin.toRender(this.position, this.renderPosition);
    this.loop.reset();
    this.input = createFlightInput();
    this.telemetryElapsed = 0;
    if (resetCamera) this.resetVersion += 1;
  }

  attach(target: HTMLElement) {
    this.manager?.dispose();
    this.exploration.mount(this.position, this.orientation);
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
    window.addEventListener('keydown', this.onNavigationKey);
    window.addEventListener('blur', this.suspendJourney);
    document.addEventListener('visibilitychange', this.onVisibility);
    return () => {
      if (this.manager !== manager) {
        manager.dispose();
        return;
      }
      window.removeEventListener('keydown', this.onNavigationKey);
      window.removeEventListener('blur', this.suspendJourney);
      document.removeEventListener('visibilitychange', this.onVisibility);
      manager.dispose();
      this.exploration.dispose();
      useFlightStore.getState().setRendererReady(false);
      if (this.manager === manager) this.manager = null;
    };
  }

  private onNavigationKey = (event: KeyboardEvent) => {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      (event.target as HTMLElement | null)?.isContentEditable
    )
      return;
    const keys = GAME_CONFIG.navigationKeys;
    const overlay = useExplorationStore.getState().overlay;
    if (event.code === 'Escape') {
      if (this.exploration.jump.busy) {
        event.preventDefault();
        this.exploration.cancelJump();
      } else if (overlay) {
        event.preventDefault();
        this.exploration.closeMap();
      }
      return;
    }
    if (
      ![keys.galaxy, keys.local, keys.nextTarget, keys.clearTarget].some(
        (code) => code === event.code,
      )
    )
      return;
    event.preventDefault();
    if (!useFlightStore.getState().rendererReady || this.exploration.jump.busy) return;
    if (event.code === keys.galaxy || event.code === keys.local) {
      const view = event.code === keys.galaxy ? 'galaxy' : 'local';
      if (overlay === view) this.exploration.closeMap();
      else this.exploration.openMap(view);
    } else if (!overlay) {
      if (event.code === keys.nextTarget) this.exploration.cycleTarget();
      if (event.code === keys.clearTarget) this.exploration.selectTarget(null);
    }
  };
  private suspendJourney = () => {
    this.exploration.suspend();
  };
  private onVisibility = () => {
    if (document.hidden) this.exploration.suspend();
  };

  startMouse = () => {
    if (!this.exploration.jump.busy && !useExplorationStore.getState().overlay)
      void this.manager?.requestMouse();
  };
  startKeyboard = () => {
    if (!this.exploration.jump.busy && !useExplorationStore.getState().overlay)
      this.manager?.startKeyboard();
  };
  pause = () => {
    this.manager?.pause();
    this.loop.reset();
    useFlightStore.getState().setInputMode(null);
  };
  reset = () => {
    this.pause();
    this.exploration.cancelJump();
    this.exploration.closeMap();
    this.controller.reset();
    this.controller.setAssistance(useFlightStore.getState().assistance);
    this.arrive(this.exploration.world);
    this.exploration.syncPose(this.position, this.orientation);
    useFlightStore.setState({ notice: null, telemetry: this.controller.getTelemetry() });
  };
  markReady = () => {
    useFlightStore.getState().setRendererReady(true);
  };
  rendererFailed = () => {
    this.pause();
    this.exploration.cancelJump('The renderer stopped. Journey cancelled safely.');
    useFlightStore.getState().setRendererReady(false);
  };

  private step = (dt: number) => {
    this.previousPosition.copy(this.currentPosition);
    this.previousOrientation.copy(this.currentOrientation);
    this.controller.setAssistance(useFlightStore.getState().assistance);
    this.controller.step(this.input, dt);
    this.controller.copyTransform(this.currentPosition, this.currentOrientation);
  };

  advance(delta: number, reducedMotion = false) {
    const state = useFlightStore.getState();
    const flying = state.phase === 'flying' && !this.exploration.jump.busy;
    if (flying) {
      this.input = this.manager?.sample(delta) ?? this.input;
      const alpha = this.loop.advance(delta, this.step);
      this.position.lerpVectors(this.previousPosition, this.currentPosition, alpha);
      this.orientation.slerpQuaternions(this.previousOrientation, this.currentOrientation, alpha);
      this.telemetryElapsed += Math.min(delta, GAME_CONFIG.maxFrameTime);
      if (this.telemetryElapsed >= GAME_CONFIG.telemetryInterval) {
        this.telemetryElapsed %= GAME_CONFIG.telemetryInterval;
        state.publishTelemetry(this.controller.getTelemetry());
      }
    } else this.loop.reset();
    this.exploration.advance(delta, this.position, this.orientation, flying);
    if (this.journey.active && this.exploration.jump.busy)
      this.journey.sample(this.exploration.jump, this.position, this.orientation, reducedMotion);
    this.origin.update(this.position);
    this.origin.toRender(this.position, this.renderPosition);
  }
}
