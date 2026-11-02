import { Quaternion, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import { ShipAi } from '@/engine/combat/ShipAi';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { CombatSession } from '@/features/combat/CombatSession';
import { AI_CONFIG, ENEMY_SHIP, PLAYER_SHIP } from '@/features/combat/config';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { FlightSession } from '@/features/flight/FlightSession';
import { useCombatStore } from '@/stores/combatStore';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

const dt = 1 / 120;
let session: FlightSession;
let target: EventTarget;
let detach = () => {};
function key(code: string, type = 'keydown') {
  target.dispatchEvent(
    Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }),
  );
}
function advance(seconds: number) {
  for (let tick = 0; tick < seconds * 120; tick++) session.advance(dt);
}

beforeEach(() => {
  useFlightStore.setState(useFlightStore.getInitialState(), true);
  useExplorationStore.setState(useExplorationStore.getInitialState(), true);
  useCombatStore.setState(useCombatStore.getInitialState(), true);
  useCombatStore.setState({ sound: false });
  useExplorationStore.setState({ soundEnabled: false });
  target = new EventTarget();
  vi.stubGlobal('window', target);
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null }),
  );
  session = new FlightSession();
  detach = session.attach({ focus: vi.fn() } as unknown as HTMLElement);
  session.markReady();
  session.startKeyboard();
});
afterEach(() => {
  detach();
  vi.unstubAllGlobals();
});

describe('integrated combat lifecycle', () => {
  it('shows powered-down target shields as offline while preserving their stored charge', () => {
    session.startEncounter(true);
    const simulation = session.combat.simulation;
    const contact = simulation.targetId && simulation.ships.get(simulation.targetId);
    if (!contact) throw new Error('Practice contact');
    const charge = contact.health.shields;
    contact.controller.setFlightMode('travel');
    session.combat.publish();
    expect(useCombatStore.getState().readout.target?.shields).toBe(0);
    expect(contact.health.shields).toBe(charge);
    contact.controller.setFlightMode('combat');
    session.combat.publish();
    expect(useCombatStore.getState().readout.target?.shields).toBe(1);
  });

  it('honors Escape with a HUD or map button focused while preserving Tab focus navigation', () => {
    const buttonKey = (code: string) => {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { code });
      Object.defineProperty(event, 'target', { value: { tagName: 'BUTTON' } });
      target.dispatchEvent(event);
      return event;
    };
    expect(buttonKey('Tab').defaultPrevented).toBe(false);
    buttonKey('Space');
    advance(0.1);
    expect(session.combat.simulation.projectiles).toHaveLength(0);
    buttonKey('Escape');
    expect(useFlightStore.getState().phase).toBe('paused');
    session.startKeyboard();
    key('KeyL');
    buttonKey('Escape');
    expect(useExplorationStore.getState().overlay).toBeNull();
  });
  it('selects, cycles and clears combat targets using shared target shortcuts', () => {
    session.startEncounter(true);
    const id = session.combat.simulation.targetId;
    key('KeyX');
    expect(session.combat.simulation.targetId).toBeNull();
    key('KeyN');
    expect(session.combat.simulation.targetId).toBe(id);
    key('KeyX');
    const tab = Object.assign(new Event('keydown', { cancelable: true }), { code: 'Tab' });
    target.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(session.combat.simulation.targetId).toBe(id);
    key('KeyL');
    key('KeyX');
    expect(session.combat.simulation.targetId).toBe(id);
    const menuTab = Object.assign(new Event('keydown', { cancelable: true }), { code: 'Tab' });
    target.dispatchEvent(menuTab);
    expect(menuTab.defaultPrevented).toBe(false);
  });

  it('freezes reinforcement timers in maps and cancels pending respawns on hyperspace departure', () => {
    session.startEncounter();
    session.combat.simulation.player.health.invulnerability = 100;
    const ship = [...session.combat.simulation.ships.values()].find(
      (ship) => ship.team === 'hostile',
    );
    if (!ship) throw new Error('Expected hostile');
    ship.health.invulnerability = 0;
    session.combat.simulation.damage(ship, 1000);
    advance(0.1);
    const remaining = session.combat.encounter.nextRespawn;
    key('KeyL');
    advance(20);
    expect(session.combat.encounter.nextRespawn).toBe(remaining);
    key('Escape');
    session.startKeyboard();
    session.exploration.selectDestination('vesper');
    expect(session.exploration.beginJump()).toBe(true);
    expect(session.combat.encounter.mode).toBe('dormant');
    expect(session.combat.encounter.slots).toHaveLength(0);
    session.exploration.cancelJump();
    expect(session.combat.encounter.mode).toBe('waiting');
    expect(session.combat.simulation.targetId).toBeNull();
    expect(session.combat.simulation.events).toHaveLength(0);
  });

  it('publishes combat readouts at 10 Hz while active', () => {
    let updates = 0;
    const unsubscribe = useCombatStore.subscribe((state, previous) => {
      if (state.readout !== previous.readout) updates++;
    });
    advance(1);
    unsubscribe();
    expect(updates).toBeGreaterThanOrEqual(9);
    expect(updates).toBeLessThanOrEqual(10);
  });
  it('starts and wins a practice encounter with real fire input, then starts a patrol', () => {
    session.startEncounter(true);
    key('Space');
    advance(1.5);
    key('Space', 'keyup');
    expect(session.combat.simulation.kills).toBe(1);
    expect(session.combat.simulation.ships.size).toBe(1);
    expect(useCombatStore.getState().readout.status).toContain('Sector clear');
    key('KeyB');
    expect(session.combat.simulation.ships.size).toBe(6);
    const first = session.combat.simulation.targetId;
    key('KeyN');
    expect(session.combat.simulation.targetId).not.toBe(first);
  });
  it('publishes selected weapons immediately and suppresses selection in maps and jumps', () => {
    key('Digit2');
    expect(useCombatStore.getState().readout.weapon).toBe(2);
    key('KeyL');
    key('Digit4');
    expect(session.combat.simulation.player.weapon).toBe(2);
    key('Escape');
    session.startKeyboard();
    key('Digit3');
    expect(useCombatStore.getState().readout.weapon).toBe(3);
    key('Space');
    advance(0.8);
    key('Space', 'keyup');
    expect(session.combat.simulation.tracers.length).toBeGreaterThan(0);
    session.exploration.selectDestination('vesper');
    session.exploration.beginJump();
    key('Digit1');
    key('Space');
    advance(0.1);
    expect(session.combat.simulation.player.weapon).toBe(3);
    expect(session.combat.simulation.tracers).toHaveLength(0);
    expect(session.combat.simulation.projectiles).toHaveLength(0);
    session.exploration.cancelJump();
    session.reset();
    expect(useCombatStore.getState().readout.weapon).toBe(1);
  });

  it.each(['escape', 'blur', 'map', 'visibility'] as const)(
    'cancels a railgun charge immediately on %s without firing after resume',
    (reason) => {
      key('Digit3');
      key('Space');
      advance(0.4);
      expect(session.combat.simulation.player.railgunCharge).toBeCloseTo(0.4);
      expect(useCombatStore.getState().readout.weaponCharge).toBeGreaterThan(0);
      if (reason === 'escape') key('Escape');
      if (reason === 'blur') target.dispatchEvent(new Event('blur'));
      if (reason === 'map') key('KeyL');
      if (reason === 'visibility') {
        Object.assign(document, { hidden: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.assign(document, { hidden: false });
      }
      expect(session.combat.simulation.player.railgunCharge).toBe(0);
      expect(useCombatStore.getState().readout.weaponCharge).toBe(0);
      advance(1);
      expect(session.combat.simulation.tracers).toHaveLength(0);
      if (reason === 'map') key('Escape');
      session.startKeyboard();
      advance(0.6);
      expect(session.combat.simulation.player.railgunCharge).toBe(0);
      expect(session.combat.simulation.tracers).toHaveLength(0);
      key('Digit4');
      expect(useCombatStore.getState().readout.weapon).toBe(4);
      key('Space');
      advance(dt);
      expect(session.combat.simulation.projectiles).toHaveLength(12);
    },
  );

  it('holds enemies, celestial time, cooldowns and projectiles in maps and clears held fire', () => {
    session.startEncounter(true);
    key('Space');
    advance(0.1);
    const time = session.combat.simulation.time;
    const celestialTime = session.exploration.world.time;
    const shots = session.combat.simulation.projectiles.length;
    key('KeyL');
    advance(5);
    expect(session.combat.simulation.time).toBe(time);
    expect(session.exploration.world.time).toBe(celestialTime);
    expect(session.combat.simulation.projectiles.length).toBe(shots);
    key('KeyB');
    expect(session.combat.simulation.ships.size).toBe(2);
    key('Escape');
    session.startKeyboard();
    advance(3);
    expect(session.combat.simulation.projectiles).toHaveLength(0);
  });
  it('cleans up departures and cancelled jumps, rebuilds celestial colliders, and preserves damage', () => {
    key('KeyB');
    key('Space');
    advance(0.1);
    session.combat.simulation.player.health.invulnerability = 0;
    session.combat.simulation.damage(session.combat.simulation.player, 25);
    session.exploration.selectDestination('vesper');
    expect(session.exploration.beginJump()).toBe(true);
    expect(session.combat.simulation.ships.size).toBe(1);
    expect(session.combat.simulation.projectiles).toHaveLength(0);
    session.exploration.cancelJump();
    expect(session.combat.simulation.obstacles.length).toBe(
      session.exploration.world.definition.bodies.length,
    );
    expect(session.combat.simulation.player.health.shields).toBe(75);
    session.startKeyboard();
    advance(0.1);
    expect(session.combat.simulation.ships.size).toBe(1);
  });
  it('pauses on player death, suppresses flight/maps/encounters and respawns safely', () => {
    key('KeyB');
    session.combat.simulation.player.health.invulnerability = 0;
    session.combat.simulation.damage(session.combat.simulation.player, 500);
    advance(0.1);
    // Death from authoritative damage must be detected even before the next simulation tick.
    expect(useFlightStore.getState().phase).toBe('paused');
    expect(useCombatStore.getState().readout.dead).toBe(true);
    key('KeyM');
    expect(useExplorationStore.getState().overlay).toBeNull();
    session.startKeyboard();
    expect(useFlightStore.getState().phase).toBe('paused');
    session.respawn();
    expect(useFlightStore.getState().phase).toBe('flying');
    expect(session.combat.simulation.player.health.hull).toBe(100);
    expect(session.combat.simulation.player.health.invulnerability).toBe(3);
    expect(session.controller.speed).toBe(0);
    expect(session.combat.simulation.ships.size).toBe(1);
  });
  it('stops audio immediately on focus loss and clears held fire before any further render', () => {
    const stop = vi.spyOn(session.combat.audio, 'stop');
    key('Space');
    target.dispatchEvent(new Event('blur'));
    expect(stop).toHaveBeenCalled();
    expect(useFlightStore.getState().phase).toBe('paused');
    session.startKeyboard();
    advance(0.2);
    expect(session.combat.simulation.projectiles).toHaveLength(0);
  });

  it('releases encounter state and input on detach and can attach again in Strict Mode', () => {
    key('KeyB');
    key('Space');
    advance(0.1);
    detach();
    expect(session.combat.simulation.ships.size).toBe(1);
    expect(session.combat.simulation.projectiles).toHaveLength(0);
    expect(session.combat.simulation.effects).toHaveLength(0);
    key('KeyB');
    expect(session.combat.simulation.ships.size).toBe(1);
    detach = session.attach({ focus: vi.fn() } as unknown as HTMLElement);
    session.markReady();
    session.startKeyboard();
    key('KeyB');
    expect(session.combat.simulation.ships.size).toBe(6);
  });
});

describe('system encounters and complete dogfights', () => {
  it.each(SYSTEMS.map((system) => [system.id, system] as const))(
    'automatically starts and safely replenishes a patrol in %s',
    (_, definition) => {
      const world = new SystemRuntime(definition);
      const controller = new FlightController(PLAYER_SHIP.flight);
      const arrival = world.arrival();
      controller.relocate(
        new Vector3().fromArray(arrival.position),
        new Quaternion().fromArray(arrival.orientation),
      );
      const combat = new CombatSession(controller, createFlightInput());
      combat.setWorld(world);
      combat.simulation.player.health.invulnerability = 100;
      const tick = () => {
        world.update(world.time + dt);
        combat.step(createFlightInput(), false, dt);
      };
      for (let step = 0; step < 120 * 8; step++) tick();
      expect(combat.simulation.ships.size).toBe(6);
      const enemy = [...combat.simulation.ships.values()].find((ship) => ship.team === 'hostile');
      if (!enemy) throw new Error('Expected enemy');
      for (const ship of combat.simulation.ships.values()) ship.stationary = true;
      const id = enemy.id;
      enemy.health.invulnerability = 0;
      combat.simulation.damage(enemy, 1000, 'player');
      tick();
      for (let step = 0; step < 120 * 12 - 1; step++) tick();
      expect(combat.simulation.ships.has(id)).toBe(false);
      tick();
      const replacement = combat.simulation.ships.get(id);
      expect(replacement).toBeDefined();
      expect(replacement).not.toBe(enemy);
      expect(replacement?.health.shields).toBe(ENEMY_SHIP.defense.shields);
      expect(replacement?.health.invulnerability).toBe(3);
      for (const body of world.definition.bodies) {
        const center = world.positions.get(body.id);
        if (!center || !replacement) throw new Error('Expected body and replacement');
        expect(replacement.position.distanceTo(center)).toBeGreaterThan(
          body.radius + replacement.radius + 100,
        );
      }
      expect(combat.simulation.kills).toBe(1);
      combat.dispose();
    },
  );
  it.each(SYSTEMS.map((system) => [system.id, system] as const))(
    'spawns five safe enemies and a reachable practice target in %s',
    (_, definition) => {
      const world = new SystemRuntime(definition);
      const controller = new FlightController(PLAYER_SHIP.flight);
      const arrival = world.arrival();
      controller.relocate(
        new Vector3().fromArray(arrival.position),
        new Quaternion().fromArray(arrival.orientation),
      );
      const combat = new CombatSession(controller, createFlightInput());
      combat.setWorld(world);
      expect(combat.startEncounter()).toBe(true);
      expect(combat.simulation.ships.size).toBe(6);
      for (const ship of combat.simulation.ships.values()) {
        for (const body of world.definition.bodies) {
          const center = world.positions.get(body.id) as Vector3;
          expect(ship.position.distanceTo(center)).toBeGreaterThan(body.radius + ship.radius);
        }
      }
      combat.reset(world);
      expect(combat.startEncounter(true)).toBe(true);
      for (let tick = 0; tick < 180; tick++) {
        world.update(world.time + dt);
        combat.step(createFlightInput(), true, dt);
      }
      expect(combat.simulation.kills).toBe(1);
      combat.dispose();
    },
  );
  it('can finish a moving five-ship dogfight using commands through the player controller', () => {
    const simulation = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
    const pilot = new ShipAi();
    for (let index = 0; index < 5; index++)
      simulation.spawn(
        ENEMY_SHIP,
        new Vector3((index - 2) * 130, (index % 2) * 80, -600),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      );
    simulation.cycleTarget();
    for (
      let tick = 0;
      tick < 120 * 180 && simulation.ships.size > 1 && !simulation.player.health.destroyed;
      tick++
    ) {
      const enemy = simulation.targetId ? simulation.ships.get(simulation.targetId) : null;
      if (!enemy) break;
      pilot.step(
        simulation.player,
        enemy,
        [],
        {
          ...AI_CONFIG,
          attackRange: 1500,
          detectionRange: 3000,
          disengageRange: 10000,
          evadeDistance: 80,
          evadeOnHit: false,
          reactionTime: 0,
          aimError: 0,
          maneuverability: 1,
          aggressiveness: 0.5,
          retreatHull: 0,
        },
        dt,
      );
      simulation.player.command.flight.strafe = Math.sin(simulation.time * 1.8);
      simulation.player.command.flight.lift = Math.cos(simulation.time * 1.3) * 0.7;
      simulation.step(simulation.player.command, dt);
    }
    expect(simulation.player.health.destroyed).toBe(false);
    expect(simulation.kills).toBe(5);
    expect(simulation.ships.size).toBe(1);
  });
});
