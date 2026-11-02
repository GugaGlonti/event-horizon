import type { FlightMode } from '@/engine/simulation/flightTypes';
import type { GameplayAction } from '@/engine/simulation/shipActions';
import type { StationReadout } from '@/engine/stations/telemetry';

export type ContextAction =
  | { kind: 'ship'; label: string; action: GameplayAction }
  | { kind: 'target'; label: string; targetId: string }
  | { kind: 'combat-target'; label: string }
  | { kind: 'guidance'; label: string; notice: string };

interface GearContext {
  landed: boolean;
  takingOff?: boolean;
  landingAssist: string | null;
  docking: StationReadout;
  landingZone: { id: string; name: string } | null;
}

/** G confirms one validated procedure; a second press cancels an unfinished approach. */
export function suggestGearAction(context: GearContext): ContextAction {
  const { docking } = context;
  if (docking.phase === 'docked')
    return { kind: 'ship', label: 'Undock', action: { kind: 'undock' } };
  if (context.landed) return { kind: 'ship', label: 'Take off', action: { kind: 'takeoff' } };
  if (context.takingOff || docking.phase === 'undocking')
    return {
      kind: 'guidance',
      label: context.takingOff ? 'Taking off' : 'Undocking',
      notice: 'Gear procedure in progress. Flight controls return when clear.',
    };
  if (docking.phase !== 'undocked')
    return { kind: 'ship', label: 'Cancel docking', action: { kind: 'cancel-docking' } };
  if (context.landingAssist)
    return {
      kind: 'ship',
      label: 'Cancel landing',
      action: { kind: 'landing-assist', zoneId: null },
    };
  // A nearby berth takes priority over the landing zone underneath a surface spaceport.
  const port = docking.ports.some(
    (candidate) => !candidate.occupant && candidate.approachDistance <= 2500,
  );
  if (docking.stationId && port)
    return {
      kind: 'ship',
      label: `Dock / ${docking.stationName}`,
      action: { kind: 'dock', stationId: docking.stationId },
    };
  if (context.landingZone)
    return {
      kind: 'ship',
      label: `Land / ${context.landingZone.name}`,
      action: { kind: 'landing-assist', zoneId: context.landingZone.id },
    };
  return {
    kind: 'guidance',
    label: 'Land / dock',
    notice:
      'Fly within 2.5 km of a free berth, or below 2.5 km altitude and within 1 km of a landing zone at under 150 m/s. G handles the approach.',
  };
}

/** Tab handles targets and can confirm an available gear procedure in Travel. */
export function suggestContextAction(
  context: GearContext & {
    mode: FlightMode;
    contact: { id: string; name: string } | null;
    hasCombatTarget: boolean;
  },
): ContextAction {
  const gear = suggestGearAction(context);
  if (
    context.landed ||
    context.takingOff ||
    context.landingAssist ||
    context.docking.phase !== 'undocked'
  )
    return gear;
  if (context.mode === 'combat')
    return {
      kind: 'combat-target',
      label: context.hasCombatTarget ? 'Next combat target' : 'Acquire combat target',
    };
  if (gear.kind === 'ship') return gear;
  if (context.contact)
    return {
      kind: 'target',
      label: `Select ${context.contact.name}`,
      targetId: context.contact.id,
    };
  return {
    kind: 'guidance',
    label: 'Navigation guidance',
    notice:
      'Point toward a destination and press Tab to select it. G handles landing and docking. F switches to Combat.',
  };
}
