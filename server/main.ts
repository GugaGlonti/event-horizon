import { serverConfig } from './config';
import { createGameServer } from './createServer';

const game = await createGameServer(serverConfig());
console.info(`Event Horizon authority listening on ws://127.0.0.1:${game.port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void game.close().then(() => process.exit(0));
  });
