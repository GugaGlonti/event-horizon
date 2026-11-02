import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { NavigationComputer } from '@/engine/navigation/NavigationComputer';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import type { FlightMode } from '@/engine/simulation/flightTypes';
import { stationTelemetry } from '@/engine/stations/telemetry';
import { suggestContextAction, suggestGearAction } from '@/features/flight/contextAction';

function context() {
  const world = new MultiplayerWorld('solara');
  world.addPlayer('pilot', 'Pilot');
  return {
    mode: 'travel' as FlightMode,
    landed: false,
    landingAssist: null as string | null,
    docking: { ...stationTelemetry(world.simulation, 'pilot', null), stationId: null, ports: [] },
    landingZone: null,
    contact: null,
    hasCombatTarget: false,
  };
}

describe('contextual Tab suggestions', () => {
  it('acquires or cycles combat targets in Combat, and selects destinations in Travel', () => {
    const base = context();
    expect(suggestContextAction({ ...base, mode: 'combat' })).toMatchObject({
      kind: 'combat-target',
      label: 'Acquire combat target',
    });
    expect(suggestContextAction({ ...base, mode: 'combat', hasCombatTarget: true })).toMatchObject({
      label: 'Next combat target',
    });
    expect(
      suggestContextAction({ ...base, contact: { id: 'pelagos', name: 'Pelagos' } }),
    ).toMatchObject({ kind: 'target', targetId: 'pelagos' });
  });

  it('prioritizes a landed or docked ship before targeting', () => {
    const base = context();
    expect(suggestContextAction({ ...base, mode: 'combat', landed: true })).toMatchObject({
      action: { kind: 'takeoff' },
    });
    expect(
      suggestContextAction({ ...base, docking: { ...base.docking, phase: 'docked' } }),
    ).toMatchObject({ action: { kind: 'undock' } });
  });

  it('suggests landing only for a validated zone and makes cancellation explicit', () => {
    const base = context();
    expect(
      suggestContextAction({ ...base, landingZone: { id: 'zone', name: 'Survey' } }),
    ).toMatchObject({ action: { kind: 'landing-assist', zoneId: 'zone' } });
    expect(suggestContextAction({ ...base, landingAssist: 'zone' })).toMatchObject({
      action: { kind: 'landing-assist', zoneId: null },
    });
    expect(suggestContextAction(base)).toMatchObject({ kind: 'guidance' });
  });

  it('chooses the nearest free port in request range and never replaces an existing clearance', () => {
    const base = context();
    const ports = [
      {
        id: 'occupied',
        name: 'Occupied',
        kind: 'external' as const,
        occupant: 'other',
        approachDistance: 100,
      },
      { id: 'far', name: 'Far', kind: 'external' as const, occupant: null, approachDistance: 2501 },
      {
        id: 'near',
        name: 'Near',
        kind: 'external' as const,
        occupant: null,
        approachDistance: 200,
      },
    ];
    const docking = { ...base.docking, stationId: 'station', ports };
    expect(suggestContextAction({ ...base, docking })).toMatchObject({
      action: { kind: 'dock', stationId: 'station' },
    });
    expect(
      suggestContextAction({ ...base, docking: { ...docking, phase: 'approaching' } }),
    ).toMatchObject({ action: { kind: 'cancel-docking' } });
    expect(
      suggestContextAction({
        ...base,
        docking: { ...docking, phase: 'aligning', captureDistance: 20, speed: 2, alignment: 4 },
      }),
    ).toMatchObject({ action: { kind: 'cancel-docking' } });
    expect(
      suggestContextAction({
        ...base,
        docking: { ...docking, phase: 'aligning', captureDistance: 20, speed: 5, alignment: 4 },
      }),
    ).toMatchObject({ action: { kind: 'cancel-docking' } });
  });

  it('makes gear available in either flight mode and waits through takeoff and undocking', () => {
    const base = context();
    expect(
      suggestGearAction({ ...base, landingZone: { id: 'zone', name: 'Survey' } }),
    ).toMatchObject({ action: { kind: 'landing-assist', zoneId: 'zone' } });
    expect(suggestGearAction({ ...base, takingOff: true })).toMatchObject({ kind: 'guidance' });
    expect(
      suggestGearAction({ ...base, docking: { ...base.docking, phase: 'undocking' } }),
    ).toMatchObject({ kind: 'guidance' });
  });

  it('prefers a forward navigation contact, skips the current target, and falls back when needed', () => {
    const world = new MultiplayerWorld('solara');
    const navigation = new NavigationComputer();
    const pelagos = world.system.positions.get('pelagos');
    if (!pelagos) throw new Error('Pelagos');
    const position = pelagos.clone().add(new Vector3(0, 0, 30000));
    const first = navigation.suggest(world.system, position, new Quaternion());
    expect(first).not.toBeNull();
    expect(first?.kind).not.toBe('star');
    navigation.targetId = first?.id ?? null;
    expect(navigation.suggest(world.system, position, new Quaternion())?.id).not.toBe(first?.id);
    expect(
      navigation.suggest(
        world.system,
        position,
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      ),
    ).not.toBeNull();
  });
});
