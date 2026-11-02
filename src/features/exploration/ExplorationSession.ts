import { Quaternion, Vector3 } from 'three';
import { navigationContacts } from '@/engine/navigation/contacts';
import { HyperspaceController } from '@/engine/navigation/HyperspaceController';
import { departureBearing, findDepartureWaypoint } from '@/engine/navigation/hyperspaceDeparture';
import {
  departureObstruction,
  departureWindow,
  routeArrival,
  travelDirection,
  travelDistance,
} from '@/engine/navigation/hyperspaceRoute';
import { NavigationComputer } from '@/engine/navigation/NavigationComputer';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { StarSystemDefinition } from '@/engine/world/worldTypes';
import { loadSystem, SYSTEMS } from '@/features/exploration/data/systems';
import { HyperdriveAudio } from '@/features/exploration/HyperdriveAudio';
import { EXIT_COAST_DISTANCE, JUMP_MOTION } from '@/features/flight/HyperspaceFlight';
import {
  type DepartureGuidance,
  type MapView,
  useExplorationStore,
} from '@/stores/explorationStore';

interface Callbacks {
  onPause: () => void;
  onDepart: (direction: Readonly<Vector3>) => void;
  onCommit: (system: SystemRuntime) => void;
  onRestore: () => void;
  onError: (message: string) => void;
  onGuide?: () => void;
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
  private sourceId: string | null = null;
  private departureDestination: string | null = null;
  private departureWaypoint: Vector3 | null = null;
  private departurePlanTime = -Infinity;
  private readonly departurePlanPosition = new Vector3();

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
    this.audio.prepare();
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
    if (this.jump.busy || this.authorizing) return false;
    this.callbacks.onPause();
    useExplorationStore.setState({ overlay: view, error: null });
    this.publish();
    return true;
  };
  closeMap = () => {
    if (this.authorizing)
      this.cancelJump('Travel request cancelled. Holding in the current system.');
    useExplorationStore.setState({ overlay: null });
  };
  selectDestination = (id: string) => {
    if (!this.jump.busy && !this.authorizing && SYSTEMS.some((system) => system.id === id)) {
      if (id !== this.departureDestination) this.cancelDeparture();
      useExplorationStore.setState({ destinationId: id, error: null });
    }
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

  canDepart: (() => string | null) | null = null;
  authorizeJump: (() => Promise<boolean>) | null = null;
  prepareNetworkDestination: ((id: string, signal: AbortSignal) => Promise<void>) | null = null;
  private authorizing = false;
  cancelDeparture = () => {
    this.departureDestination = null;
    this.departureWaypoint = null;
    useExplorationStore.setState({ departure: null });
  };

  private checkDeparture() {
    const destination = useExplorationStore.getState().destinationId;
    const target = SYSTEMS.find((system) => system.id === destination);
    if (this.jump.phase !== 'IDLE' || !target || target.id === this.world.definition.id) {
      this.jump.request(
        this.world.definition.id,
        destination,
        SYSTEMS.map((system) => system.id),
      );
      useExplorationStore.setState({ error: this.jump.error ?? 'Hyperdrive is cooling down.' });
      return false;
    }
    const reason = this.canDepart?.();
    if (reason) {
      useExplorationStore.setState({ error: reason });
      return false;
    }
    travelDirection(this.world.definition, target, this.direction);
    if (
      departureObstruction(
        this.world,
        this.lastPosition,
        this.direction,
        JUMP_MOTION.departureDistance,
        departureWindow(this.world.definition, target),
      )
    ) {
      this.departureDestination = target.id;
      this.departureWaypoint = null;
      useExplorationStore.setState({ overlay: null, error: null });
      this.publish();
      this.callbacks.onGuide?.();
      return false;
    }
    return true;
  }

  private departureReadout(): DepartureGuidance | null {
    if (!this.departureDestination) return null;
    const target = SYSTEMS.find((system) => system.id === this.departureDestination);
    if (!target) return null;
    travelDirection(this.world.definition, target, this.direction);
    const obstruction = departureObstruction(
      this.world,
      this.lastPosition,
      this.direction,
      JUMP_MOTION.departureDistance,
      departureWindow(this.world.definition, target),
    );
    if (
      obstruction &&
      (!this.departureWaypoint ||
        this.clock - this.departurePlanTime > 0.5 ||
        this.lastPosition.distanceToSquared(this.departurePlanPosition) > 500 ** 2 ||
        departureObstruction(
          this.world,
          this.departureWaypoint,
          this.direction,
          JUMP_MOTION.departureDistance,
          departureWindow(this.world.definition, target),
        ))
    ) {
      const waypoint = findDepartureWaypoint(
        this.world,
        this.lastPosition,
        this.direction,
        JUMP_MOTION.departureDistance,
        departureWindow(this.world.definition, target),
      );
      this.departureWaypoint = waypoint ? new Vector3().copy(waypoint) : null;
      this.departurePlanPosition.copy(this.lastPosition);
      this.departurePlanTime = this.clock;
    }
    const waypoint = this.departureWaypoint;
    const reason = this.canDepart?.();
    return {
      destinationId: target.id,
      blockedBy: reason ?? obstruction?.name ?? null,
      waypoint: waypoint ? [waypoint.x, waypoint.y, waypoint.z] : null,
      distance: obstruction && waypoint ? this.lastPosition.distanceTo(waypoint) : 0,
      ...(waypoint
        ? departureBearing(this.lastPosition, this.lastOrientation, waypoint)
        : { bearingX: 0, bearingY: 0, behind: false }),
      ready: !obstruction && !reason,
    };
  }

  beginJump = () => {
    if (this.disposed || this.authorizing || this.jump.busy || !this.checkDeparture()) return false;
    if (this.authorizeJump) {
      if (this.authorizing || this.jump.busy) return false;
      this.authorizing = true;
      const generation = this.generation;
      void this.authorizeJump()
        .then((allowed) => {
          const suspended = this.suspended;
          this.authorizing = false;
          if (allowed && !this.disposed && generation === this.generation) {
            this.startJump();
            this.suspended = suspended;
            if (suspended) this.audio.update(this.jump, true);
            this.publish();
          }
        })
        .catch((error: unknown) => {
          this.authorizing = false;
          if (!this.disposed && generation === this.generation)
            this.fail(error instanceof Error ? error.message : 'Travel denied.');
        });
      return true;
    }
    return this.startJump();
  };
  private startJump = () => {
    if (this.disposed || !this.checkDeparture()) return false;
    const state = useExplorationStore.getState();
    const destinationDefinition = SYSTEMS.find((system) => system.id === state.destinationId);
    if (
      !this.jump.request(
        this.world.definition.id,
        state.destinationId,
        SYSTEMS.map((system) => system.id),
        destinationDefinition ? travelDistance(this.world.definition, destinationDefinition) : 0,
      )
    ) {
      useExplorationStore.setState({ error: this.jump.error ?? 'Hyperdrive is cooling down.' });
      return false;
    }
    this.callbacks.onPause();
    const target = SYSTEMS.find((system) => system.id === this.jump.destinationId);
    if (!target) return false;
    travelDirection(this.world.definition, target, this.direction);
    this.cancelDeparture();
    this.sourceId = this.world.definition.id;
    this.callbacks.onDepart(this.direction);
    this.closeMap();
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
        .then(async () => {
          preparation.signal.throwIfAborted();
          await this.prepareNetworkDestination?.(destination, preparation.signal);
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
    this.cancelDeparture();
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
    this.cancelDeparture();
    const wasBusy = this.jump.busy || this.authorizing;
    this.authorizing = false;
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
    if (!this.jump.busy && !this.authorizing) return;
    this.suspended = true;
    this.audio.update(this.jump, true);
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

  adoptWorld(system: SystemRuntime, time: number) {
    this.cancelDeparture();
    this.world = system;
    this.clock = time;
    this.world.update(time);
    this.navigation.select(system.definition.defaultTargetId, system);
    this.publish();
  }
  synchronizeTime(time: number) {
    this.clock = time;
    this.world.update(time);
  }

  advanceWorld(dt: number) {
    this.clock += dt;
    this.world.update(this.clock);
  }

  advance(
    delta: number,
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    flying: boolean,
    fixedWorld = false,
  ) {
    if (this.disposed) return;
    this.lastPosition.copy(position);
    this.lastOrientation.copy(orientation);
    const dt = Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, 0.1));
    if (this.suspended) return;
    if ((flying && !fixedWorld) || this.jump.busy) this.advanceWorld(dt);
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
    if (this.jump.busy) this.audio.update(this.jump, false);
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
      departure: this.departureReadout(),
      jump: {
        phase: this.jump.phase,
        progress: this.jump.progress,
        suspended: this.suspended,
        destinationId: this.jump.destinationId,
        sourceId: this.jump.phase === 'IDLE' ? null : this.sourceId,
        distance: this.jump.distance,
        distanceTraveled: this.jump.distanceTraveled,
        elapsedSeconds: this.jump.flightElapsed,
        remainingSeconds:
          this.jump.phase === 'IDLE'
            ? 0
            : Math.max(0, this.jump.journeyDuration - this.jump.journeyElapsed),
        totalSeconds: this.jump.phase === 'IDLE' ? 0 : this.jump.journeyDuration,
        waiting: this.jump.waiting,
      },
      navigation: this.navigation.sample(this.world, position, this.lastOrientation),
      chart: {
        ship: [position.x, position.y, position.z],
        bodies: navigationContacts(this.world.definition).map((body) => {
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
