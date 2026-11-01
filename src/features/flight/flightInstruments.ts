export type SpeedTrend = 'accelerating' | 'decelerating' | 'steady';

/** Speed magnitude works in forward/reverse; a small dead band rejects settled-speed noise. */
export function getSpeedTrend(previousSpeed: number, speed: number, seconds: number): SpeedTrend {
  if (
    ![previousSpeed, speed, seconds].every(Number.isFinite) ||
    previousSpeed < 0 ||
    speed < 0 ||
    seconds <= 0
  )
    return 'steady';
  const acceleration = (speed - previousSpeed) / seconds;
  return acceleration > 0.5 ? 'accelerating' : acceleration < -0.5 ? 'decelerating' : 'steady';
}
