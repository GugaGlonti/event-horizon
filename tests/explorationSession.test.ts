import { Quaternion, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import type { StarSystemDefinition } from '@/engine/world/worldTypes';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { ExplorationSession } from '@/features/exploration/ExplorationSession';
import { useExplorationStore } from '@/stores/explorationStore';

const callbacks = () => ({
  onPause: vi.fn(),
  onDepart: vi.fn(),
  onCommit: vi.fn(),
  onRestore: vi.fn(),
  onError: vi.fn(),
  onGuide: vi.fn(),
});
function definition(id: string) {
  const system = SYSTEMS.find((candidate) => candidate.id === id);
  if (!system) throw new Error('Missing fixture.');
  return system;
}
function tick(session: ExplorationSession, seconds: number) {
  const pose = new Vector3().fromArray(session.world.arrival().position);
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame += 1) {
    session.markArrivalReady(session.world.definition.id);
    session.advance(1 / 60, pose, new Quaternion(), false);
  }
}
const sessions: ExplorationSession[] = [];
function create(loader?: (id: string, signal: AbortSignal) => Promise<StarSystemDefinition>) {
  const events = callbacks();
  const session = new ExplorationSession(events, loader);
  sessions.push(session);
  session.mount(new Vector3().fromArray(session.world.arrival().position));
  return { session, events };
}
beforeEach(() => {
  useExplorationStore.setState(useExplorationStore.getInitialState(), true);
  useExplorationStore.setState({ soundEnabled: false });
});
afterEach(() => {
  for (const session of sessions) session.dispose();
  sessions.length = 0;
});

describe('exploration transactions', () => {
  it('returns a blocked plan to flight with a launch waypoint and waits for explicit engagement', () => {
    const { session, events } = create();
    session.openMap('galaxy');
    session.syncPose(new Vector3(0, 0, 1300), new Quaternion());
    session.selectDestination('vesper');
    expect(session.beginJump()).toBe(false);
    expect(session.jump.phase).toBe('IDLE');
    expect(useExplorationStore.getState().overlay).toBeNull();
    expect(useExplorationStore.getState().error).toBeNull();
    const guidance = useExplorationStore.getState().departure;
    expect(guidance?.ready).toBe(false);
    expect(guidance?.waypoint).not.toBeNull();
    expect(events.onGuide).toHaveBeenCalledOnce();
    expect(events.onDepart).not.toHaveBeenCalled();
    expect(events.onCommit).not.toHaveBeenCalled();
    if (!guidance?.waypoint) throw new Error('Missing guidance.');
    session.syncPose(new Vector3().fromArray(guidance.waypoint), new Quaternion());
    expect(useExplorationStore.getState().departure?.ready).toBe(true);
    expect(session.jump.phase).toBe('IDLE');
    expect(session.beginJump()).toBe(true);
    expect(useExplorationStore.getState().departure).toBeNull();
    expect(events.onDepart).toHaveBeenCalledOnce();
  });

  it('never reserves network travel while blocked and rechecks clearance before confirmation', () => {
    const { session, events } = create();
    session.authorizeJump = vi.fn(async () => true);
    session.syncPose(new Vector3(0, 0, 1300), new Quaternion());
    session.selectDestination('vesper');
    session.beginJump();
    expect(session.authorizeJump).not.toHaveBeenCalled();
    const waypoint = useExplorationStore.getState().departure?.waypoint;
    if (!waypoint) throw new Error('Missing guidance.');
    session.syncPose(new Vector3().fromArray(waypoint), new Quaternion());
    expect(useExplorationStore.getState().departure?.ready).toBe(true);
    session.syncPose(new Vector3(0, 0, 1300), new Quaternion());
    expect(session.beginJump()).toBe(false);
    expect(events.onDepart).not.toHaveBeenCalled();
    session.selectDestination('aether');
    expect(useExplorationStore.getState().departure).toBeNull();
  });

  it('travels Solara → Vesper → Aether → Solara, commits once per journey and restores flight', async () => {
    const { session, events } = create();
    for (const destination of ['vesper', 'aether', 'solara']) {
      session.selectDestination(destination);
      expect(session.beginJump()).toBe(true);
      await vi.waitFor(() => expect(session.jump.prepared).toBe(true));
      tick(session, session.jump.journeyDuration + HYPERSPACE_TIMING.COOLDOWN + 1);
      expect(session.world.definition.id).toBe(destination);
      expect(session.navigation.targetId).toBe(definition(destination).defaultTargetId);
      expect(session.jump.phase).toBe('IDLE');
    }
    expect(events.onCommit).toHaveBeenCalledTimes(3);
    expect(events.onRestore).toHaveBeenCalledTimes(3);
  });

  it('leaves the source system intact when preparation rejects, then permits a retry', async () => {
    let failing = true;
    const { session, events } = create(async (id) => {
      if (failing) throw new Error('Preparation failed.');
      return definition(id);
    });
    const source = session.world;
    session.selectDestination('vesper');
    session.beginJump();
    await vi.waitFor(() => expect(session.jump.phase).toBe('IDLE'));
    expect(session.world).toBe(source);
    expect(events.onCommit).not.toHaveBeenCalled();
    expect(useExplorationStore.getState().error).toBe('Preparation failed.');
    failing = false;
    expect(session.beginJump()).toBe(true);
    await vi.waitFor(() => expect(session.jump.prepared).toBe(true));
    tick(session, session.jump.journeyDuration + 1);
    expect(session.world.definition.id).toBe('vesper');
  });

  it.each(['identity', 'configuration'])('recovers from invalid destination %s', async (fault) => {
    const { session } = create(async () =>
      fault === 'identity'
        ? definition('aether')
        : {
            ...definition('vesper'),
            spawns: [
              { id: 'unsafe', bodyId: 'nacre', offset: [0, 0, 0], orientation: [0, 0, 0, 1] },
            ],
            arrivalId: 'unsafe',
          },
    );
    session.selectDestination('vesper');
    session.beginJump();
    await vi.waitFor(() => expect(session.jump.phase).toBe('IDLE'));
    expect(session.world.definition.id).toBe('solara');
    expect(useExplorationStore.getState().error).toBeTruthy();
  });

  it.each(['cancel', 'dispose'])('ignores late preparation results after %s', async (action) => {
    let finish = (_definition: StarSystemDefinition) => {};
    const loader = vi.fn(
      () =>
        new Promise<StarSystemDefinition>((resolve) => {
          finish = resolve;
        }),
    );
    const { session, events } = create(loader);
    session.selectDestination('vesper');
    session.beginJump();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    if (action === 'dispose') session.dispose();
    else session.cancelJump();
    finish(definition('vesper'));
    await Promise.resolve();
    await Promise.resolve();
    tick(session, session.jump.journeyDuration + HYPERSPACE_TIMING.COOLDOWN + 1);
    expect(session.world.definition.id).toBe('solara');
    expect(session.jump.phase).toBe('IDLE');
    expect(events.onCommit).not.toHaveBeenCalled();
    expect(events.onRestore).not.toHaveBeenCalled();
  });

  it('recovers from a loader throwing synchronously before returning a promise', async () => {
    const { session } = create(() => {
      throw new Error('Synchronous preparation failure.');
    });
    session.selectDestination('vesper');
    expect(session.beginJump()).toBe(true);
    await vi.waitFor(() => expect(session.jump.phase).toBe('IDLE'));
    expect(session.world.definition.id).toBe('solara');
    expect(useExplorationStore.getState().error).toMatch(/Synchronous/);
  });

  it('invalidates a timed-out preparation so a late resolution cannot commit', async () => {
    let finish = (_definition: StarSystemDefinition) => {};
    const loader = vi.fn(
      () =>
        new Promise<StarSystemDefinition>((resolve) => {
          finish = resolve;
        }),
    );
    const { session, events } = create(loader);
    session.selectDestination('vesper');
    session.beginJump();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    tick(session, 20);
    expect(session.jump.phase).toBe('IDLE');
    expect(useExplorationStore.getState().error).toMatch(/timed out/);
    finish(definition('vesper'));
    await Promise.resolve();
    await Promise.resolve();
    tick(session, session.jump.journeyDuration + 1);
    expect(session.world.definition.id).toBe('solara');
    expect(events.onCommit).not.toHaveBeenCalled();
  });

  it('holds a journey on focus loss and resumes explicitly without skipping phases', async () => {
    const { session } = create();
    session.selectDestination('vesper');
    session.beginJump();
    await vi.waitFor(() => expect(session.jump.prepared).toBe(true));
    tick(session, 1);
    const elapsed = session.jump.elapsed;
    session.suspend();
    tick(session, 100);
    expect(session.jump.elapsed).toBe(elapsed);
    expect(session.jump.phase).toBe('CHARGING');
    session.resumeJourney();
    tick(session, session.jump.journeyDuration + 1);
    expect(session.world.definition.id).toBe('vesper');
    expect(session.jump.busy).toBe(false);
  });

  it('blocks menus and overlapping jumps, and cancellation after arrival retains a safe destination', async () => {
    const { session, events } = create();
    session.openMap('galaxy');
    session.selectDestination('vesper');
    session.beginJump();
    expect(useExplorationStore.getState().overlay).toBeNull();
    expect(session.openMap('local')).toBe(false);
    expect(session.beginJump()).toBe(false);
    await vi.waitFor(() => expect(session.jump.prepared).toBe(true));
    tick(
      session,
      HYPERSPACE_TIMING.CHARGING +
        HYPERSPACE_TIMING.ACCELERATING +
        session.jump.duration('HYPERSPACE') +
        0.1,
    );
    expect(session.jump.phase).toBe('EXITING');
    session.cancelJump();
    tick(session, session.jump.journeyDuration + 1);
    expect(session.world.definition.id).toBe('vesper');
    expect(session.jump.phase).toBe('IDLE');
    expect(events.onCommit).toHaveBeenCalledOnce();
    expect(events.onRestore).not.toHaveBeenCalled();
  });
});

describe('network-approved journey preparation', () => {
  it('locks the requested destination and cancels pending approval when the chart closes', async () => {
    const { session, events } = create();
    let approve!: (allowed: boolean) => void;
    session.authorizeJump = () =>
      new Promise<boolean>((resolve) => {
        approve = resolve;
      });
    session.openMap('galaxy');
    session.selectDestination('vesper');
    session.beginJump();
    session.selectDestination('aether');
    expect(useExplorationStore.getState().destinationId).toBe('vesper');
    session.closeMap();
    approve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.jump.phase).toBe('IDLE');
    expect(events.onDepart).not.toHaveBeenCalled();
    expect(events.onError).toHaveBeenCalledOnce();
  });
  it('holds an approval arriving after focus loss until the pilot explicitly resumes', async () => {
    const { session } = create();
    let approve!: (allowed: boolean) => void;
    session.authorizeJump = () =>
      new Promise<boolean>((resolve) => {
        approve = resolve;
      });
    session.selectDestination('vesper');
    session.beginJump();
    session.suspend();
    approve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.isSuspended).toBe(true);
    tick(session, 8);
    expect(session.jump.phase).toBe('CHARGING');
    expect(session.jump.elapsed).toBe(0);
    session.resumeJourney();
    await vi.waitFor(() => expect(session.jump.prepared).toBe(true));
    tick(session, session.jump.journeyDuration + 1);
    expect(session.world.definition.id).toBe('vesper');
  });
});
