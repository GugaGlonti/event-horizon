const FULL_TURN = Math.PI * 2;
const MAX_FRAME_DELTA_SECONDS = 0.1;

/**
 * Advance an angle in radians using angular velocity in radians per second.
 * Cap background-tab gaps to prevent a visible jump on resume. This is a
 * visual animation helper; future gameplay needs a separate fixed-step loop.
 */
export function advanceAngle(angle: number, angularVelocity: number, deltaSeconds: number): number {
  const delta = Math.max(0, Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS));
  const next = (angle + angularVelocity * delta) % FULL_TURN;
  return (next + FULL_TURN) % FULL_TURN;
}
