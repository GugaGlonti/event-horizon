import { Quaternion, Vector3 } from 'three';
import { FlightAudioMix } from '@/engine/audio/FlightAudioMix';
import { FlightInputManager } from '@/engine/input/FlightInputManager';
import type { JoinOptions, TravelPermit } from '@/engine/network/protocol';
import { planetaryTelemetry } from '@/engine/planetary/telemetry';
import { FixedStepLoop } from '@/engine/simulation/FixedStepLoop';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { type GameplayAction, performGameplayAction } from '@/engine/simulation/shipActions';
import { stationTelemetry } from '@/engine/stations/telemetry';
import { RenderOrigin } from '@/engine/world/RenderOrigin';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SYSTEMS } from '@/engine/world/systems';
import { CombatSession } from '@/features/combat/CombatSession';
import { ExplorationSession } from '@/features/exploration/ExplorationSession';
import { EngineAudio } from '@/features/flight/audio/EngineAudio';
import {
  createEngineSoundInput,
  engineTranslationEffort,
} from '@/features/flight/audio/EngineSoundModel';
import { loadEngineAssets } from '@/features/flight/audio/engineAssets';
import { FLIGHT_CONFIG, GAME_CONFIG } from '@/features/flight/config';
import { HyperspaceFlight, JUMP_MOTION } from '@/features/flight/HyperspaceFlight';
import { MultiplayerSession } from '@/features/multiplayer/MultiplayerSession';
import { useCombatStore } from '@/stores/combatStore';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';
import { usePlanetaryStore } from '@/stores/planetaryStore';
import { useStationStore } from '@/stores/stationStore';

/** One player session. Logical poses stay in system coordinates; GPU poses use renderOrigin. */
export class FlightSession {
  resetVersion = 0;
  get planetaryReadout() {
    return usePlanetaryStore.getState().readout ?? planetaryTelemetry(this.controller);
  }
  get stationReadout() {
    return (
      useStationStore.getState().readout ??
      stationTelemetry(this.combat.simulation, 'player', this.exploration.navigation.targetId)
    );
  }
  private publishPlanetary() {
    useStationStore.setState({
      readout: stationTelemetry(
        this.combat.simulation,
        'player',
        this.exploration.navigation.targetId,
      ),
    });
    usePlanetaryStore.setState({
      readout: planetaryTelemetry(this.controller, this.exploration.navigation.targetId),
    });
  }
  readonly controller = new FlightController(FLIGHT_CONFIG);
  readonly position = new Vector3();
  readonly renderPosition = new Vector3();
  readonly origin = new RenderOrigin();
  readonly orientation = new Quaternion();
  readonly multiplayer: MultiplayerSession;
  private awaitingRespawn = false;
  private travelPermit: TravelPermit | null = null;
  readonly exploration: ExplorationSession;
  readonly journey = new HyperspaceFlight();
  private readonly audioMix = new FlightAudioMix();
  private combatActivity = 0;
  readonly engineAudio = new EngineAudio(loadEngineAssets, this.audioMix);
  private readonly engineSoundInput = createEngineSoundInput();
  readonly combat: CombatSession;
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
    this.combat = new CombatSession(this.controller, this.input);
    this.combat.audio.connect(this.audioMix);
    this.exploration = new ExplorationSession({
      onPause: this.pause,
      onDepart: (direction) => {
        if (useFlightStore.getState().engineSound) this.engineAudio.unlock();
        this.combat.depart();
        this.journey.begin(this.position, this.orientation, direction);
      },
      onCommit: (system) => {
        const snapshot = this.multiplayer?.network.latest;
        if (this.multiplayer?.enabled && snapshot) this.exploration.synchronizeTime(snapshot.time);
        this.journey.arrive(system);
        const arrival = snapshot?.ships.find((ship) => ship.id === snapshot.playerId);
        if (this.multiplayer?.enabled && arrival)
          this.journey.setArrival(arrival.flight.position, arrival.flight.orientation);
        this.journey.sample(this.exploration.jump, this.position, this.orientation);
        this.controller.relocate(this.position, this.orientation);
        this.snapPose(false);
        useFlightStore.getState().publishTelemetry(this.controller.getTelemetry());
      },
      onRestore: () => {
        this.combat.setWorld(this.exploration.world);
        this.journey.finish(this.position, this.orientation);
        this.controller.relocate(this.position, this.orientation, JUMP_MOTION.exitSpeed);
        if (this.multiplayer?.enabled) this.multiplayer.restoreArrival();
        this.travelPermit = null;
        this.snapPose(false);
        useFlightStore.getState().publishTelemetry(this.controller.getTelemetry());
        this.startKeyboard();
      },
      onError: (message) => {
        if (this.multiplayer?.enabled) {
          this.multiplayer.network.cancelTravel();
          const snapshot = this.multiplayer.network.latest;
          if (snapshot && snapshot.systemId !== this.exploration.world.definition.id) {
            const definition = SYSTEMS.find((system) => system.id === snapshot.systemId);
            if (definition)
              this.exploration.adoptWorld(
                new SystemRuntime(definition, snapshot.time),
                snapshot.time,
              );
          }
          this.travelPermit = null;
        }
        this.combat.setWorld(this.exploration.world);
        if (this.journey.active) {
          this.journey.active = false;
          this.controller.relocate(this.position, this.orientation);
          this.snapPose(false);
          useFlightStore.getState().publishTelemetry(this.controller.getTelemetry());
        }
        if (this.multiplayer?.enabled) {
          this.multiplayer.restoreArrival();
          this.snapPose();
        }
        useFlightStore.getState().setNotice(message);
      },
    });
    this.multiplayer = new MultiplayerSession(
      this.controller,
      this.combat,
      () => this.exploration.jump.busy,
      (snapshot) => {
        const definition = SYSTEMS.find((system) => system.id === snapshot.systemId);
        if (definition) {
          this.exploration.adoptWorld(new SystemRuntime(definition, snapshot.time), snapshot.time);
          this.combat.setWorld(this.exploration.world);
        }
        const own = snapshot.ships.find((ship) => ship.id === snapshot.playerId);
        if (own) this.controller.restore(own.flight);
        if (own?.transferring) this.multiplayer.restoreArrival();
        this.snapPose();
      },
    );
    this.exploration.canDepart = () =>
      this.controller.flightLocked ||
      this.controller.surface.phase !== 'flying' ||
      this.controller.landingAssist
        ? 'Take off or undock before engaging hyperdrive.'
        : null;
    this.multiplayer.network.onTravelExpired = () =>
      this.exploration.cancelJump('Travel permit expired. Holding safely in the current system.');
    this.exploration.prepareNetworkDestination = async (_id, signal) => {
      if (!this.multiplayer.enabled || !this.travelPermit) return;
      await new Promise<void>((resolve, reject) => {
        const poll = () => {
          if (signal.aborted) {
            reject(new Error('Journey cancelled.'));
            return;
          }
          if (this.exploration.jump.phase === 'HYPERSPACE') {
            resolve();
            return;
          }
          setTimeout(poll, 30);
        };
        poll();
      });
      signal.throwIfAborted();
      await this.multiplayer.network.transfer(this.travelPermit);
      if (signal.aborted && this.multiplayer.enabled) {
        const snapshot = this.multiplayer.network.latest;
        const definition = SYSTEMS.find((system) => system.id === snapshot?.systemId);
        if (snapshot && definition)
          this.exploration.adoptWorld(new SystemRuntime(definition, snapshot.time), snapshot.time);
        this.multiplayer.restoreArrival();
        this.snapPose();
      }
    };
    this.arrive(this.exploration.world);
    this.combat.reset(this.exploration.world);
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
    this.publishPlanetary();
  }

  attach(target: HTMLElement) {
    this.manager?.dispose();
    this.engineAudio.prepare();
    this.exploration.mount(this.position, this.orientation);
    this.combat.setWorld(this.exploration.world);
    const store = useFlightStore.getState();
    store.publishTelemetry(this.controller.getTelemetry());
    const manager = new FlightInputManager(
      target,
      {
        onMode: (mode) => {
          if (mode === null) this.multiplayer.pause();
          if (mode === null) this.engineAudio.stop();
          if (mode === null) {
            this.combat.audio.stop();
            this.combat.cancelWeaponCharge();
          }
          this.loop.reset();
          this.controller.copyTransform(this.currentPosition, this.currentOrientation);
          this.previousPosition.copy(this.currentPosition);
          this.previousOrientation.copy(this.currentOrientation);
          useFlightStore.getState().setInputMode(mode);
        },
        onCamera: store.toggleCamera,
        onAssistance: store.toggleAssistance,
        onWeapon: (slot) => this.combat.selectWeapon(slot),
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
      this.multiplayer.disconnect();
      this.exploration.dispose();
      this.engineAudio.dispose();
      this.combat.dispose();
      this.audioMix.dispose();
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
      tag === 'SELECT' ||
      (event.target as HTMLElement | null)?.isContentEditable
    )
      return;
    if (['KeyK', 'KeyU', 'KeyP', 'KeyI', 'KeyO', 'KeyJ'].includes(event.code)) {
      if (
        useFlightStore.getState().phase !== 'flying' ||
        this.exploration.jump.busy ||
        useExplorationStore.getState().overlay
      )
        return;
      event.preventDefault();
      if (event.code === 'KeyK')
        this.shipAction({ kind: 'landing-gear', enabled: !this.controller.landingGear });
      if (event.code === 'KeyU')
        this.shipAction({ kind: this.stationReadout.phase === 'docked' ? 'undock' : 'takeoff' });
      if (event.code === 'KeyO')
        this.shipAction({ kind: 'transit', enabled: !this.controller.transit });
      if (event.code === 'KeyI') this.shipAction({ kind: 'cancel-docking' });
      if (event.code === 'KeyP') this.requestDocking();
      if (event.code === 'KeyJ') this.toggleLandingAssist();
      return;
    }
    if (['KeyB', 'KeyN', 'KeyG', 'KeyH', 'Tab'].includes(event.code)) {
      if (event.code === 'Tab' && tag === 'BUTTON') return;
      if (
        useFlightStore.getState().phase !== 'flying' ||
        this.exploration.jump.busy ||
        useExplorationStore.getState().overlay ||
        this.combat.simulation.player.health.destroyed
      )
        return;
      event.preventDefault();
      if (event.code === 'KeyB') this.startEncounter();
      else {
        if (event.code === 'KeyG') this.combat.simulation.targetAhead();
        else if (event.code === 'KeyH') this.combat.simulation.clearTarget();
        else this.combat.simulation.cycleTarget();
        this.combat.publish();
      }
      return;
    }
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
    if (
      !useFlightStore.getState().rendererReady ||
      this.exploration.jump.busy ||
      this.combat.simulation.player.health.destroyed
    )
      return;
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
    if (
      !this.exploration.jump.busy &&
      !useExplorationStore.getState().overlay &&
      !this.combat.simulation.player.health.destroyed
    ) {
      this.unlockAudio();
      if (useFlightStore.getState().engineSound) this.engineAudio.unlock();
      void this.manager?.requestMouse();
    }
  };
  startKeyboard = () => {
    if (
      !this.exploration.jump.busy &&
      !useExplorationStore.getState().overlay &&
      !this.combat.simulation.player.health.destroyed
    ) {
      this.unlockAudio();
      if (useFlightStore.getState().engineSound) this.engineAudio.unlock();
      this.manager?.startKeyboard();
    }
  };
  pause = () => {
    if (this.controller.landingAssist) {
      if (this.multiplayer?.enabled)
        this.multiplayer.network.action({ kind: 'landing-assist', zoneId: null });
      this.controller.landingAssist = null;
    }
    this.multiplayer?.pause();
    this.engineAudio.stop();
    this.combat.audio.stop();
    this.combat.cancelWeaponCharge();
    this.manager?.pause();
    this.loop.reset();
    useFlightStore.getState().setInputMode(null);
  };
  connectMultiplayer = (name: string) => {
    this.pause();
    this.exploration.cancelJump();
    this.exploration.authorizeJump = async () => {
      const destination = useExplorationStore.getState().destinationId as
        | JoinOptions['systemId']
        | null;
      if (!destination) return false;
      this.travelPermit = await this.multiplayer.network.travel(destination);
      return true;
    };
    this.multiplayer.connect(name, this.exploration.world.definition.id as JoinOptions['systemId']);
  };
  disconnectMultiplayer = () => {
    this.pause();
    this.multiplayer.disconnect();
    this.exploration.authorizeJump = null;
    this.reset();
  };
  reset = () => {
    this.pause();
    if (this.multiplayer.enabled) {
      this.multiplayer.network.action({ kind: 'respawn' });
      return;
    }
    this.exploration.cancelJump();
    this.exploration.closeMap();
    this.controller.reset();
    this.controller.setAssistance(useFlightStore.getState().assistance);
    this.arrive(this.exploration.world);
    this.combat.reset(this.exploration.world);
    this.exploration.syncPose(this.position, this.orientation);
    useFlightStore.setState({ notice: null, telemetry: this.controller.getTelemetry() });
  };
  private unlockAudio() {
    if (useCombatStore.getState().sound) this.combat.audio.unlock();
  }
  toggleEngineSound = () => {
    const enabled = !useFlightStore.getState().engineSound;
    useFlightStore.setState({ engineSound: enabled });
    if (!enabled) this.engineAudio.stop();
  };

  private updateEngineAudio(delta: number) {
    const state = useFlightStore.getState();
    const input = this.engineSoundInput;
    input.throttle = this.controller.enginePower;
    input.requestedThrottle = this.input.throttle;
    input.speed = this.controller.speed;
    input.boosting = this.controller.isBoosting;
    input.boostReserve = state.telemetry.boostCharge;
    input.braking = this.input.brake && !(this.input.reverse && input.throttle === 0);
    input.translation = engineTranslationEffort(this.input);
    input.cockpit = state.cameraMode === 'cockpit';
    this.engineAudio.update(
      input,
      delta,
      state.engineSound && state.phase === 'flying' && !this.exploration.jump.busy,
    );
    this.audioMix.update(this.combatActivity, delta);
  }
  shipAction = (action: GameplayAction) => {
    if (this.exploration.jump.busy || this.combat.simulation.player.health.destroyed) return;
    if (this.multiplayer.enabled) this.multiplayer.network.action(action);
    else {
      const error = performGameplayAction(this.combat.simulation, 'player', action);
      if (error) useFlightStore.getState().setNotice(error);
    }
    this.publishPlanetary();
  };
  requestDocking = () => {
    const docking = this.stationReadout;
    if (['approaching', 'aligning'].includes(docking.phase)) this.shipAction({ kind: 'capture' });
    else if (docking.stationId) this.shipAction({ kind: 'dock', stationId: docking.stationId });
  };
  toggleLandingAssist = () => {
    if (!this.controller.landingAssist && !this.exploration.navigation.targetId) {
      useFlightStore.getState().setNotice('Select a landing zone first.');
      return;
    }
    this.shipAction({
      kind: 'landing-assist',
      zoneId: this.controller.landingAssist ? null : this.exploration.navigation.targetId,
    });
  };
  startEncounter = (practice = false) => {
    if (this.exploration.jump.busy || this.combat.simulation.player.health.destroyed) return;
    if (this.multiplayer.enabled) this.multiplayer.network.action({ kind: 'encounter', practice });
    else this.combat.startEncounter(practice);
  };
  respawn = () => {
    if (this.multiplayer.enabled) {
      this.pause();
      this.awaitingRespawn = true;
      this.multiplayer.network.action({ kind: 'respawn' });
      return;
    }
    this.reset();
    this.startKeyboard();
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
    if (this.combat.simulation.player.health.destroyed) {
      this.pause();
      this.combat.publish();
      return;
    }
    this.previousPosition.copy(this.currentPosition);
    this.previousOrientation.copy(this.currentOrientation);
    this.controller.setAssistance(useFlightStore.getState().assistance);
    this.exploration.advanceWorld(dt);
    this.combat.step(this.input, this.manager?.firing ?? false, dt);
    if (this.combat.simulation.player.health.destroyed) {
      this.pause();
      this.combat.publish();
    }
    this.controller.copyTransform(this.currentPosition, this.currentOrientation);
  };

  advance(delta: number, reducedMotion = false) {
    const state = useFlightStore.getState();
    const flying = state.phase === 'flying' && !this.exploration.jump.busy;
    if (this.multiplayer.enabled) {
      if (flying) this.input = this.manager?.sample(delta) ?? this.input;
      this.multiplayer.advance(
        delta,
        this.input,
        this.manager?.firing ?? false,
        !flying,
        state.assistance,
      );
      if (!this.exploration.jump.busy) {
        this.multiplayer.present(this.position, this.orientation);
        const snapshot = this.multiplayer.network.latest;
        if (snapshot) this.exploration.synchronizeTime(snapshot.time);
      }
      this.telemetryElapsed += Math.min(delta, GAME_CONFIG.maxFrameTime);
      if (this.telemetryElapsed >= GAME_CONFIG.telemetryInterval) {
        state.publishTelemetry(this.controller.getTelemetry(), this.telemetryElapsed);
        this.publishPlanetary();
        this.telemetryElapsed %= GAME_CONFIG.telemetryInterval;
        if (!flying && !this.exploration.jump.busy)
          this.exploration.syncPose(this.position, this.orientation);
      }
      if (this.awaitingRespawn && !this.combat.simulation.player.health.destroyed) {
        this.awaitingRespawn = false;
        this.snapPose();
        this.startKeyboard();
      }
      if (this.combat.simulation.player.health.destroyed && flying) this.pause();
    } else if (flying) {
      this.input = this.manager?.sample(delta) ?? this.input;
      const alpha = this.loop.advance(delta, this.step);
      this.combat.simulation.alpha = alpha;
      this.position.lerpVectors(this.previousPosition, this.currentPosition, alpha);
      this.orientation.slerpQuaternions(this.previousOrientation, this.currentOrientation, alpha);
      this.telemetryElapsed += Math.min(delta, GAME_CONFIG.maxFrameTime);
      if (this.telemetryElapsed >= GAME_CONFIG.telemetryInterval) {
        state.publishTelemetry(this.controller.getTelemetry(), this.telemetryElapsed);
        this.publishPlanetary();
        this.telemetryElapsed %= GAME_CONFIG.telemetryInterval;
        this.combat.publish();
      }
    } else this.loop.reset();
    this.exploration.advance(delta, this.position, this.orientation, flying, true);
    this.combat.audio.update(
      this.combat.simulation,
      useCombatStore.getState().sound && useFlightStore.getState().phase === 'flying',
      delta,
      state.cameraMode === 'cockpit',
      this.engineAudio.trafficBuffer,
    );
    this.combatActivity = this.combat.audio.activity;
    if (this.journey.active && this.exploration.jump.busy)
      this.journey.sample(this.exploration.jump, this.position, this.orientation, reducedMotion);
    this.origin.update(this.position);
    this.origin.toRender(this.position, this.renderPosition);
    this.updateEngineAudio(delta);
  }
}
