import { describe, expect, it } from 'vitest';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import { AI_CONFIG, PLAYER_SHIP } from '@/engine/combat/config';
import { Vector3 } from '@/engine/math/linear';
import { neutralInput } from '@/engine/network/InputQueue';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { Prediction, predict } from '@/engine/network/Prediction';
import { actionSchema, inputSchema, snapshotSchema } from '@/engine/network/protocol';
import { FLIGHT_CONFIG, FLIGHT_MODE_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';

const idle = { flight: createFlightInput(), fire: false };
function reserve(controller: FlightController, charge: number) {
  controller.restore({ ...controller.snapshot(), boostCharge: charge, boostDelay: 100 });
}

describe('Travel and Combat flight', () => {
  it.each(['travel', 'combat'] as const)('keeps %s angular damping stabilized', (mode) => {
    const controller = new FlightController(FLIGHT_CONFIG);
    controller.setAssistance(false);
    controller.setFlightMode(mode);
    controller.step({ ...createFlightInput(), roll: 1 }, 0.1);
    const initial = Math.abs(controller.snapshot().angularVelocity[2]);
    for (let i = 0; i < 120; i++) controller.step(createFlightInput(), 1 / 120);
    expect(controller.snapshot().assistance).toBe(true);
    expect(Math.abs(controller.snapshot().angularVelocity[2])).toBeLessThan(initial * 0.01);
  });

  it('travels faster than Combat and boosts without consuming an empty reserve', () => {
    const travel = new FlightController(FLIGHT_CONFIG),
      combat = new FlightController(FLIGHT_CONFIG);
    travel.setFlightMode('travel');
    reserve(travel, 0);
    const input = { ...createFlightInput(), throttle: 1, boost: true };
    for (let i = 0; i < 1200; i++) {
      travel.step(input, 1 / 120);
      combat.step(input, 1 / 120);
    }
    expect(travel.speed).toBeGreaterThan(combat.speed * 5);
    expect(travel.energyReserve).toBe(0);
    expect(travel.isBoosting).toBe(true);
    expect(travel.shieldsEnabled).toBe(false);
    expect(travel.weaponsEnabled).toBe(false);
  });

  it('brakes continuously into Combat and holds weapons until combat speed is safe', () => {
    const controller = new FlightController(FLIGHT_CONFIG);
    controller.setFlightMode('travel');
    controller.resolveMotion(new Vector3(), new Vector3(0, 0, -3000));
    controller.setFlightMode('combat');
    expect(controller.weaponsEnabled).toBe(false);
    controller.step({ ...createFlightInput(), throttle: 1, boost: true }, 1 / 120);
    expect(controller.speed).toBeGreaterThan(2900);
    expect(controller.speed).toBeLessThan(3000);
    for (let i = 0; i < 1200; i++)
      controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    expect(controller.speed).toBeLessThanOrEqual(FLIGHT_CONFIG.boostMaxSpeed);
    expect(controller.weaponsEnabled).toBe(true);
  });

  it.each([1, 2, 3, 4] as const)(
    'powers down slot %s and shields in Travel without erasing shield charge',
    (weapon) => {
      const world = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
      world.player.controller.setFlightMode('travel');
      reserve(world.player.controller, 0.4);
      world.player.health.shields = 50;
      world.player.health.sinceDamage = 100;
      for (let i = 0; i < 120; i++) world.step({ ...idle, fire: true, weapon }, 1 / 120);
      expect(world.events.filter((event) => event.kind === 'fired')).toHaveLength(0);
      expect(world.player.railgunCharge).toBe(0);
      expect(world.player.controller.energyReserve).toBe(0.4);
      expect(world.player.health.shields).toBe(50);
      world.damage(world.player, 10);
      expect(world.player.health.hull).toBe(90);
      expect(world.player.health.shields).toBe(50);
      expect(world.player.shieldHit).toBe(false);
      world.player.controller.setFlightMode('combat');
      world.damage(world.player, 10);
      expect(world.player.health.hull).toBe(90);
      expect(world.player.health.shields).toBe(40);
    },
  );

  it.each([1, 2, 3, 4] as const)(
    'charges shared energy for a slot %s shot, plus shield upkeep',
    (weapon) => {
      const world = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
      reserve(world.player.controller, 1);
      const ticks = weapon === 3 ? 96 : 1;
      for (let i = 0; i < ticks; i++) world.step({ ...idle, fire: true, weapon }, 1 / 120);
      expect(world.events.filter((event) => event.kind === 'fired')).toHaveLength(1);
      expect(world.player.controller.energyReserve).toBeCloseTo(
        1 - FLIGHT_MODE_CONFIG.weaponCost[weapon] - (FLIGHT_MODE_CONFIG.shieldUpkeep * ticks) / 120,
        5,
      );
    },
  );

  it('limits shield regeneration to available energy and exposes an unshielded hull at zero', () => {
    const world = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
    reserve(world.player.controller, 0.003);
    world.player.health.shields = 50;
    world.player.health.sinceDamage = 100;
    world.step(idle, 0.1);
    expect(world.player.health.shields).toBeCloseTo(50.25);
    expect(world.player.controller.energyReserve).toBeCloseTo(0);
    world.damage(world.player, 10);
    expect(world.player.health.hull).toBe(90);
    expect(world.player.health.shields).toBeCloseTo(50.25);
    expect(world.player.controller.consumeEnergy(-1)).toBe(false);
    expect(world.player.controller.consumeEnergy(Infinity)).toBe(false);
  });

  it('shares boost drain and weapon reserve, then recharges after the same delay', () => {
    const world = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
    reserve(world.player.controller, 0.5);
    world.step({ flight: { ...idle.flight, throttle: 1, boost: true }, fire: true }, 0.1);
    expect(world.player.controller.energyReserve).toBeCloseTo(0.5 - 0.025 - 0.04 - 0.002);
    for (let i = 0; i < 120; i++) world.step(idle, 1 / 120);
    const before = world.player.controller.energyReserve;
    for (let i = 0; i < 240; i++) world.step(idle, 1 / 120);
    expect(world.player.controller.energyReserve).toBeGreaterThan(before);
  });

  it('restores mode and energy before replaying only flight, across delayed mode changes', () => {
    const authority = new FlightController(FLIGHT_CONFIG),
      local = new FlightController(FLIGHT_CONFIG);
    const prediction = new Prediction(local);
    const states: { state: ReturnType<FlightController['snapshot']>; ack: number }[] = [];
    for (let seq = 1; seq <= 180; seq++) {
      const command = {
        ...neutralInput(seq),
        paused: false,
        fire: true,
        flightMode: seq < 90 ? ('travel' as const) : ('combat' as const),
        flight: { ...idle.flight, throttle: 1, boost: true },
      };
      predict(authority, command, 30);
      prediction.apply(command);
      states.push({ state: authority.snapshot(), ack: seq });
      if (states.length > 4) {
        const previous = states.shift();
        if (previous) prediction.reconcile(previous.state, previous.ack);
      }
    }
    prediction.reconcile(authority.snapshot(), 180);
    expect(local.snapshot()).toEqual(authority.snapshot());
    expect(local.flightMode).toBe('combat');
    expect(local.snapshot().assistance).toBe(true);
  });

  it('validates only two mode intentions and retains mode through neutral timeouts', () => {
    expect(inputSchema.safeParse({ ...neutralInput(1), flightMode: 'approach' }).success).toBe(
      false,
    );
    expect(inputSchema.safeParse({ ...neutralInput(1), assistance: false }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: 'transit', enabled: true }).success).toBe(false);
    const world = new MultiplayerWorld('solara');
    const pilot = world.addPlayer('pilot', 'Pilot');
    pilot.inputs.accept({ ...neutralInput(1), flightMode: 'travel', paused: false, fire: true });
    world.step();
    for (let i = 0; i < 30; i++) world.step();
    expect(pilot.ship.controller.flightMode).toBe('travel');
    expect(pilot.ship.controller.snapshot().assistance).toBe(true);
    expect(pilot.ship.command.fire).toBe(false);
    expect(snapshotSchema.safeParse(world.snapshot('pilot', 6000)).success).toBe(true);
  });
});
