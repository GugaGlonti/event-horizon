import { Quaternion, Vector3 } from 'three';
import { HyperspaceController } from '@/engine/navigation/HyperspaceController';
import {
  departureObstruction,
  routeArrival,
  travelDirection,
} from '@/engine/navigation/hyperspaceRoute';
import { NavigationComputer } from '@/engine/navigation/NavigationComputer';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { StarSystemDefinition } from '@/engine/world/worldTypes';
import { loadSystem, SYSTEMS } from '@/features/exploration/data/systems';
import { HyperdriveAudio } from '@/features/exploration/HyperdriveAudio';
import { EXIT_COAST_DISTANCE, JUMP_MOTION } from '@/features/flight/HyperspaceFlight';
import { type MapView, useExplorationStore } from '@/stores/explorationStore';

interface Callbacks {
  onPause: () => void;
  onDepart: (direction: Readonly<Vector3>) => void;
  onCommit: (system: SystemRuntime) => void;
  onRestore: () => void;
  onError: (message: string) => void;
}
type SystemLoader = (id: string, signal: AbortSignal) => Promise<StarSystemDefinition>;

/** One cancellable journey. Preparation is asynchronous; activation is an atomic, masked commit. */
export class ExplorationSession {
  world: SystemRuntime;
  readonly navigation = new NavigationComputer();
  readonly jump = new HyperspaceController();
  readonly audio = new HyperdriveAudio();
  private readonly callbacks: Callbacks;
  private readonly loader: SystemLoader;
  private readonly lastPosition = new Vector3();
  private readonly lastOrientation = new Quaternion();
  private readonly direction = new Vector3();
  private prepared: SystemRuntime | null = null;
  private preparation: AbortController | null = null;
  private generation = 0;
  private clock = 0;
  private publicationElapsed = 0;
  private arrivalElapsed = 0;
  private suspended = false;
  private disposed = false;

  constructor(callbacks: Callbacks, loader: SystemLoader = loadSystem) {
    const start = SYSTEMS.find((system) => system.id === 'solara');
    if (!start) throw new Error('Starting system is missing.');
    this.world = new SystemRuntime(start);
    this.navigation.select(start.defaultTargetId, this.world);
    this.callbacks = callbacks;
    this.loader = loader;
  }

  get isSuspended() {
    return this.suspended;
  }

  mount(
    position: Readonly<Vector3> = this.lastPosition,
    orientation: Readonly<Quaternion> = this.lastOrientation,
  ) {
    this.disposed = false;
    this.lastPosition.copy(position);
    this.lastOrientation.copy(orientation);
    this.publish();
  }

  syncPose(position: Readonly<Vector3>, orientation: Readonly<Quaternion>) {
    this.lastPosition.copy(position);
    this.lastOrientation.copy(orientation);
    this.publish();
  }

  openMap = (view: MapView) => {
    if (this.jump.busy) return false;
    this.callbacks.onPause();
    useExplorationStore.setState({ overlay: view, error: null });
    this.publish();
    return true;
  };
  closeMap = () => {
    useExplorationStore.setState({ overlay: null });
  };
  selectDestination = (id: string) => {
    if (!this.jump.busy && SYSTEMS.some((system) => system.id === id))
      useExplorationStore.setState({ destinationId: id, error: null });
  };
  selectTarget = (id: string | null) => {
    if (this.navigation.select(id, this.world)) this.publish();
  };
  cycleTarget = () => {
    this.navigation.cycle(this.world);
    this.publish();
  };
  toggleSound = () => {
    const enabled = !useExplorationStore.getState().soundEnabled;
    useExplorationStore.setState({ soundEnabled: enabled });
    if (!enabled) this.audio.stop();
  };

  beginJump = () => {
    if (this.disposed) return false;
    const state = useExplorationStore.getState();
    if (
      !this.jump.request(
        this.world.definition.id,
        state.destinationId,
        SYSTEMS.map((system) => system.id),
      )
    ) {
      useExplorationStore.setState({ error: this.jump.error ?? 'Hyperdrive is cooling down.' });
      return false;
    }
    this.callbacks.onPause();
    this.closeMap();
    const target = SYSTEMS.find((system) => system.id === this.jump.destinationId);
    if (!target) return false;
    travelDirection(this.world.definition, target, this.direction);
    const obstruction = departureObstruction(
      this.world,
      this.lastPosition,
      this.direction,
      JUMP_MOTION.departureDistance,
    );
    if (obstruction) {
      this.fail(
        `Departure lane blocked by ${obstruction.name}. Move clear before engaging hyperdrive.`,
      );
      return false;
    }
    this.callbacks.onDepart(this.direction);
    this.suspended = false;
    useExplorationStore.setState({ error: null, arrival: null });
    if (state.soundEnabled) this.audio.start();
    const destination = this.jump.destinationId;
    const generation = ++this.generation;
    this.preparation?.abort();
    const preparation = new AbortController();
    this.preparation = preparation;
    if (destination)
      void Promise.resolve()
        .then(() => {
          preparation.signal.throwIfAborted();
          return this.loader(destination, preparation.signal);
        })
        .then((definition) => {
          if (this.disposed || preparation.signal.aborted || generation !== this.generation) return;
          if (definition.id !== destination)
            throw new Error('Destination identity does not match the flight plan.');
          this.prepared = new SystemRuntime(definition, this.clock);
          this.prepared.arrival();
          routeArrival(this.prepared, this.direction, EXIT_COAST_DISTANCE);
          this.jump.prepared = true;
        })
        .catch((error: unknown) => {
          if (this.disposed || preparation.signal.aborted || generation !== this.generation) return;
          this.fail(error instanceof Error ? error.message : 'Destination preparation failed.');
        });
    this.publish();
    return true;
  };

  private fail(message: string) {
    this.preparation?.abort();
    this.generation += 1;
    this.prepared = null;
    this.jump.fail(message);
    this.audio.stop();
    this.callbacks.onPause();
    this.callbacks.onError(message);
    useExplorationStore.setState({ error: message });
    this.publish();
  }

  cancelJump = (message = 'Jump cancelled. Holding position in the current system.') => {
    const wasBusy = this.jump.busy;
    this.preparation?.abort();
    this.generation += 1;
    this.prepared = null;
    this.jump.cancel();
    this.audio.stop();
    this.suspended = false;
    this.arrivalElapsed = 0;
    useExplorationStore.setState({ arrival: null });
    if (wasBusy) {
      this.callbacks.onPause();
      this.callbacks.onError(message);
    }
    this.publish();
  };
  suspend = () => {
    if (!this.jump.busy) return;
    this.suspended = true;
    this.audio.update(this.jump.intensity, true);
    this.publish();
  };
  resumeJourney = () => {
    this.suspended = false;
    this.publish();
  };
  markArrivalReady = (systemId: string) => {
    if (this.jump.phase === 'EXITING' && this.world.definition.id === systemId)
      this.jump.arrivalReady = true;
  };

  advance(
    delta: number,
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    flying: boolean,
  ) {
    if (this.disposed) return;
    this.lastPosition.copy(position);
    this.lastOrientation.copy(orientation);
    const dt = Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, 0.1));
    if (this.suspended) return;
    if (flying || this.jump.busy) {
      this.clock += dt;
      this.world.update(this.clock);
    }
    const previous = this.jump.phase;
    this.jump.advance(dt);
    if (previous !== this.jump.phase) {
      if (this.jump.phase === 'EXITING') {
        if (!this.prepared) {
          this.fail('Destination is unavailable. Your previous system is intact.');
          return;
        }
        this.prepared.update(this.clock);
        try {
          routeArrival(this.prepared, this.direction, EXIT_COAST_DISTANCE);
        } catch (error) {
          this.fail(error instanceof Error ? error.message : 'Arrival corridor unavailable.');
          return;
        }
        this.world = this.prepared;
        this.prepared = null;
        this.world.update(this.clock);
        this.navigation.select(this.world.definition.defaultTargetId, this.world);
        this.callbacks.onCommit(this.world);
        const arrival = routeArrival(this.world, this.direction, EXIT_COAST_DISTANCE);
        this.lastPosition.copy(arrival.position);
        this.lastOrientation.copy(arrival.orientation);
      }
      if (this.jump.phase === 'COOLDOWN') {
        this.audio.stop();
        this.arrivalElapsed = 3;
        useExplorationStore.setState({
          arrival: `Welcome to ${this.world.definition.name}. Keyboard flight restored.`,
        });
        this.callbacks.onRestore();
      }
      if (this.jump.phase === 'IDLE' && this.jump.error) {
        this.fail(this.jump.error);
        return;
      }
      this.publish();
    }
    if (this.jump.busy) this.audio.update(this.jump.intensity, false);
    if (this.arrivalElapsed > 0) {
      this.arrivalElapsed -= dt;
      if (this.arrivalElapsed <= 0) useExplorationStore.setState({ arrival: null });
    }
    if (!flying && this.jump.phase === 'IDLE' && this.arrivalElapsed <= 0) return;
    this.publicationElapsed += dt;
    if (this.publicationElapsed >= 0.1) {
      this.publicationElapsed %= 0.1;
      this.publish();
    }
  }

  private publish() {
    const position = this.lastPosition;
    useExplorationStore.setState({
      systemId: this.world.definition.id,
      jump: {
        phase: this.jump.phase,
        progress: this.jump.progress,
        suspended: this.suspended,
        destinationId: this.jump.destinationId,
      },
      navigation: this.navigation.sample(this.world, position, this.lastOrientation),
      chart: {
        ship: [position.x, position.y, position.z],
        bodies: this.world.definition.bodies.map((body) => {
          const location = this.world.positions.get(body.id) ?? position;
          return {
            id: body.id,
            position: [location.x, location.y, location.z],
            distance: Math.max(0, position.distanceTo(location) - body.radius),
          };
        }),
      },
    });
  }

  dispose() {
    this.cancelJump();
    this.disposed = true;
    this.audio.dispose();
    useExplorationStore.setState({ overlay: null, arrival: null });
  }
}
