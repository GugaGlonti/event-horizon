import type { FlightMode } from '@/engine/simulation/flightTypes';
import type { GameplayAction } from '@/engine/simulation/shipActions';
import type { StationReadout } from '@/engine/stations/telemetry';

export type ContextAction =
  | { kind: 'ship'; label: string; action: GameplayAction }
  | { kind: 'target'; label: string; targetId: string }
  | { kind: 'combat-target'; label: string }
  | { kind: 'guidance'; label: string; notice: string };

/** A suggestion never performs motion or assigns authority state. Tab confirms one intention. */
export function suggestContextAction(context: {
  mode: FlightMode;
  landed: boolean;
  landingAssist: string | null;
  docking: StationReadout;
  landingZone: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
  hasCombatTarget: boolean;
}): ContextAction {
  const { docking } = context;
  if (docking.phase === 'docked')
    return { kind: 'ship', label: 'Undock', action: { kind: 'undock' } };
  if (context.landed) return { kind: 'ship', label: 'Take off', action: { kind: 'takeoff' } };
  if (['requested', 'approaching', 'aligning', 'docking', 'undocking'].includes(docking.phase)) {
    if (
      ['approaching', 'aligning'].includes(docking.phase) &&
      docking.captureDistance < 45 &&
      docking.speed < 3 &&
      docking.alignment < 7
    )
      return { kind: 'ship', label: 'Capture berth', action: { kind: 'capture' } };
    return {
      kind: 'guidance',
      label: 'Follow berth marker',
      notice:
        'Follow the berth marker. Final capture: below 45 m, 3 m/s and 7°. I cancels clearance.',
    };
  }
  if (context.mode === 'combat')
    return {
      kind: 'combat-target',
      label: context.hasCombatTarget ? 'Next combat target' : 'Acquire combat target',
    };
  if (context.landingAssist)
    return {
      kind: 'ship',
      label: 'Cancel landing',
      action: { kind: 'landing-assist', zoneId: null },
    };
  if (context.landingZone)
    return {
      kind: 'ship',
      label: `Land at ${context.landingZone.name}`,
      action: { kind: 'landing-assist', zoneId: context.landingZone.id },
    };
  const port = docking.ports
    .filter((candidate) => !candidate.occupant && candidate.approachDistance <= 2500)
    .sort((a, b) => a.approachDistance - b.approachDistance)[0];
  if (docking.stationId && port)
    return {
      kind: 'ship',
      label: `Dock / ${port.name}`,
      action: { kind: 'dock', stationId: docking.stationId, portId: port.id },
    };
  if (context.contact)
    return {
      kind: 'target',
      label: `Select ${context.contact.name}`,
      targetId: context.contact.id,
    };
  return {
    kind: 'guidance',
    label: 'Navigation guidance',
    notice: 'Point toward a destination and press Tab to select it. F switches to Combat.',
  };
}
