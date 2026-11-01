import { z } from 'zod';

const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
const schema = z.object({
  SERVER_HOST: z.string().min(1).default('127.0.0.1'),
  SERVER_DEBUG: z.enum(['true', 'false']).default('false'),
  SERVER_PORT: integer(2567, 1, 65535),
  SERVER_TICK_RATE: integer(30, 10, 60),
  SERVER_SNAPSHOT_RATE: integer(20, 1, 60),
  SERVER_CAPACITY: integer(16, 2, 32),
  SERVER_RECONNECT_SECONDS: integer(15, 1, 60),
  SERVER_RELEVANCE_METRES: integer(6000, 4000, 100000),
});
export function serverConfig(env: Record<string, string | undefined> = process.env) {
  const value = schema.parse(env);
  return {
    host: value.SERVER_HOST,
    debug: value.SERVER_DEBUG === 'true',
    port: value.SERVER_PORT,
    tickRate: value.SERVER_TICK_RATE,
    snapshotRate: Math.min(value.SERVER_TICK_RATE, value.SERVER_SNAPSHOT_RATE),
    capacity: value.SERVER_CAPACITY,
    grace: value.SERVER_RECONNECT_SECONDS,
    relevance: value.SERVER_RELEVANCE_METRES,
  };
}
export type ServerConfig = ReturnType<typeof serverConfig>;
