export interface TunnelLightSample {
  x: number;
  y: number;
  z: number;
  pulse: number;
  fill: number;
}

/** Smooth light pools shared by the cloud shader and the foreground lamps. Reuse the output. */
export function sampleTunnelLights(time: number, reduced: boolean, out: TunnelLightSample) {
  const t = reduced ? 0 : time;
  out.x = Math.sin(t * 0.37 + 0.5) * 7 + Math.sin(t * 0.13) * 1.2;
  out.y = 3.2 + Math.sin(t * 0.29 + 1.5) * 4.8;
  out.z = 5 + Math.sin(t * 0.19) * 2;
  out.pulse = reduced
    ? 0.45
    : 0.2 + (0.5 + Math.sin(t * 2.3 + Math.sin(t * 0.67)) * 0.5) ** 3 * 0.8;
  out.fill = reduced ? 0.35 : 0.2 + (0.5 + Math.sin(t * 1.7 + 2.4) * 0.5) ** 4 * 0.8;
}
