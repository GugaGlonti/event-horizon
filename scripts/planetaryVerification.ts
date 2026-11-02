/** Loopback-only QA authority. Fixture commands are deliberately absent from the game protocol. */
import { createInterface } from 'node:readline';
import { serverConfig } from '../server/config';
import { createGameServer } from '../server/createServer';
import { placeVerificationPilots, verificationScenarios } from './planetaryFixtures';

const game = await createGameServer({ ...serverConfig({}), host: '127.0.0.1' });
console.info(
  `QA authority: ws://127.0.0.1:${game.port}. Commands: status, deep, orbit, entry, descent, low, land, station, hangar, city, city-pad, damage, exit.`,
);
const input = createInterface({ input: process.stdin, output: process.stdout });
input.on('line', (line) => {
  const command = line.trim();
  if (command === 'exit') {
    input.close();
    void game.close().then(() => process.exit(0));
    return;
  }
  for (const room of game.rooms) {
    const world = room.world;
    if (command === 'status') {
      console.info(
        JSON.stringify({
          system: world.system.definition.id,
          metrics: room.metrics,
          pilots: [...world.pilots.values()].map((p) => ({
            id: p.id,
            name: p.name,
            flight: p.ship.controller.snapshot(),
            docking: world.simulation.stations?.state(p.id),
          })),
        }),
      );
      continue;
    }
    if (command === 'damage') {
      for (const pilot of world.pilots.values()) {
        pilot.ship.health.hull = 40;
        pilot.ship.health.shields = 10;
        pilot.ship.health.sinceDamage = 0;
        pilot.ship.heat = 0.7;
      }
      console.info('Damaged QA ships for service verification.');
      continue;
    }
    const scenario = verificationScenarios.find((s) => s === command);
    if (!scenario || !placeVerificationPilots(world, scenario)) continue;
    console.info(
      `Fixture ${command}: ${world.pilots.size} pilots in ${world.system.definition.id}`,
    );
  }
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    input.close();
    void game.close().then(() => process.exit(0));
  });
