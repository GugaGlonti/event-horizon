# Planetary approach pacing — 2026-11-02

This tuning implements the five descent improvements without changing planetary scale. Pelagos
remains 186 km across its reference radius with a 14 km atmosphere. Existing ordinary flight,
terrain contacts, landing rules, stations, combat and hyperspace remain on the shared controller.
No dependencies or assets were added.

## Controls and speed profile

1. **Fast approach:** O retains the existing space transit drive and extends it into a 1.4 km/s
   planetary approach near landable worlds. The envelope uses `v² = u² + 2as` and forward terrain/
   station sweeps, restoring ordinary speed near terrain or facilities. It does not instantly delete
   excess velocity. Cruise/boost remain 180/360 m/s with O off.
2. **Planet-relative descent:** near a landable world below 60 km, V/R control planetary down/up
   regardless of nose direction. Altitude-aware jets reach 800 m/s aloft with 100 m/s² acceleration,
   then brake progressively. Downward lookahead sees terrain before contact. Elsewhere V/R retain
   their existing local translation. Explicit steering and F assistance remain available.
3. **Later precision:** deployed gear starts reducing translation speed below 55 m and reaches
   2.2 m/s below 13 m center altitude, approximately 8 m above gear contact. The shared profile
   controls both manual descent and landing assistance. Gear still disables O.
4. **Optional final landing:** select a landing zone, slow below 150 m/s, approach within 1 km
   horizontally and below 2.5 km altitude, release movement controls, then press J. Assistance
   deploys gear, preserves heading while leveling, settles horizontal drift over the zone and
   descends continuously. It requires F assistance and traffic clearance. J, manual movement, F,
   maps and every pause path cancel it; resuming flight does not resume assistance automatically.
5. **Progress feedback:** the HUD shows approach stage, approximate descent ETA, stopping distance,
   descent speed limit and a brake warning. Speed and atmospheric density drive a smooth airflow
   loop; thin shader cloud haze and existing terrain LOD/detail give visual motion cues.

Hold V to maintain the requested descent through drag; releasing now retains surface coasting.
S brakes and leaves coasting; W returns to normal flight. F stabilization does not select a speed
target or mode. U starts the existing powered takeoff. If using J,
release V/W/S first: manual input has priority. Final capture still requires the existing safe gear,
slope, attitude, vertical/horizontal speeds and nearby-ship clearance. Assistance grants no immunity.

ETA integrates the shared descent envelope with a bounded 64-sample calculation at the existing
10 Hz telemetry rate, including approximate acceleration and settling. It assumes continued descent;
it omits lateral approach/alignment holds. It disappears when not descending and changes when the
pilot brakes, steers or hovers. It is not a promised arrival time. Braking guidance uses actual
planet-relative downward velocity rather than a decorative timer.

## Authority, ownership and tradeoffs

`engine/planetary/approach.ts` owns speed envelopes, gear tuning helpers and ETA. Configuration is in
`engine/planetary/config.ts`; controller, telemetry and prediction consume the same values.
`PlanetaryEnvironment.flightClearance` queries deterministic terrain and station proxies without
render meshes. Continuous collision sweeps remain the final authority. Speed assistance cannot
guarantee recovery after starting too close to terrain with excessive incoming speed; the HUD warns
and impacts still apply damage.

Landing assist is a zone ID in complete flight snapshots, not a client-submitted trajectory. Shared
controller code owns orientation, bounded velocity changes, terrain contact and capture. Protocol
**v4** retains the selected-zone/cancel action and replicated assist state and adds full travel mode;
clients and servers must
update together. Invalid IDs, excessive range/speed, unavailable ships and docking conflicts are
rejected. Manual movement, paused/timed-out input and disconnect cancel the assist. Reconciliation
restores/replays the complete state, preserving authority over landing outcomes.

The FlightSession input-mode callback cancels assistance as well as the explicit pause method:
Escape, blur, pointer-lock release and visibility loss can enter through that separate callback.
Scrollable HUD instruments accept wheel input in keyboard mode; mouse capture retains wheel control.
The narrow panel is height-bounded above the bottom instruments.

The existing engine audio adapter owns one lazy airflow voice, including fades in its 24-voice cap.
Its deterministic synthesized buffer is cached across pauses, released on disposal, and needs no
download or extra context. It shares gesture unlock, mute/pause and weapon ducking. Cloud haze adds
no texture, mesh or render pass; it extends the existing sky shader using explicit world time and
body-relative offsets. Reduced motion freezes autonomous cloud drift. Existing terrain subdivision
and distance-faded surface detail remain in place.

## Initial pacing verification

`npm run check` passed **379 tests across 35 files**, Biome, TypeScript checking and the production
build. Vite retains the existing large-chunk advisory. `npm run test:integration` also passed its five
real-socket tests separately during implementation. New coverage checks approach stopping distance,
terrain lookahead, progressive speed handoff, tilted planet-relative lift, gear precision, continuous
descent, assist validation/landing/manual override, prediction replay and pause cancellation, ETA,
airflow response/resource lifetime, and keyboard HUD scrolling.

A real two-client integration test sends the new intention through Colyseus, rejects an unknown zone,
observes authoritative gear/assist state on the other client and observes manual cancellation there.
The existing real-socket landing, takeoff, berth occupancy, repairs and hyperspace tests still pass.

A continuous 120 Hz simulation starting 22 km above the survey surface measured:

- **45.3 s** to LANDED, with no impact damage or teleport.
- Atmospheric entry at **13.975 s**.
- **11.092 s** over the final 200 m.
- Peak speed **800.006 m/s** (the small excess is the residual gravity step).
- At 10 s, ETA was approximately 33 s; actual remaining time was 35.3 s.

The browser was also flown from the normal starting orbit to touchdown using K and held V, without
server placement fixtures or a scene reload during descent. Both defense bars remained at 100%.
The separate input calls included release/coast intervals; 45.3 s is the fixed-step measurement,
not a browser wall-clock claim. U/R takeoff, selected-zone J landing, manual strafe cancellation,
re-engagement, both cameras, Escape/resume cancellation and a 390 × 844 viewport were exercised.
The narrow overlap and the separate Escape callback gap found during these checks were corrected.
The fresh verification tab had no console warnings/errors.

A browser spot sample near 1.4 km AGL showed 120 FPS / 8.3 ms, 50 draw calls, 70,052 triangles,
108 geometries / 5 textures, 105 live / 138 cached patches and 0.6 ms latest patch generation.
During approach/camera/pause transitions another sample was 112 FPS / 8.9 ms. These are local
rolling samples, not sustained hardware-independent targets. GPU bytes are unavailable. Audio
automation/lifetime was tested; subjective speaker/headphone mixing remains manual tuning.

`LOAD_SCENARIO=descent npm run test:load -- 2 8 16` exercised ten-second descents from 6 km with
deployed gear, server and bots sharing one Node 22.20 process on Darwin, with no added latency:

| Clients | Actual Hz | Mean / max tick ms | Overruns | Down KiB/s/client | CPU, one core | RSS MiB | p95 input ack ms |
| ------- | --------- | ------------------ | -------- | ----------------- | ------------- | ------- | ---------------- |
| 2       | 30.00     | 0.562 / 3.821      | 0        | 33.9              | 7.2%          | 103.1   | 20               |
| 8       | 30.00     | 1.027 / 2.998      | 0        | 112.4             | 9.3%          | 115.9   | 37               |
| 16      | 29.98     | 2.444 / 15.158     | 0        | 217.2             | 16.0%         | 122.6   | 52               |

Transport sizes exclude WebSocket/TCP headers. Raw values and reference descent timings are retained
in [benchmark JSON](benchmarks/planetary-approach-2026-11-02.json). The short descending runs do not
supersede the earlier station-load spike or establish production/WAN capacity. Broader hardware,
latency, long-session resource and subjective sound checks remain verification limits.

## Stabilization and speed-mode separation

The subsequent flight-assist correction separates F stabilization from speed regulation:

- `normal` retains the 180/360 m/s forward-flight targets and W-release braking with F either on or off.
- `transit` selects O transit/planetary approach. F does not change its speed target or mode.
- `surface` is selected by V/R near landable worlds when W/S are released. Releasing V/R preserves
  planet-relative momentum. F damps tangent drift while preserving radial coasting. Gravity,
  atmospheric drag and terrain/station/gear braking remain active with either stabilization setting.
- W/S leave surface coasting. O selects transit with gear retracted. Gear changes adjust the surface
  envelope without cancelling coasting. Reset, arrival, docking and grounding clear the mode.

The HUD identifies NORMAL, APPROACH/TRANSIT or SURFACE COAST separately from F / STAB. The velocity
instrument uses the selected mode's scale instead of always showing the normal 180/360 labels.
Holding V still follows the measured 45.3 s reference descent; released coasting can take longer due
to atmospheric drag. Turning F off exposes full gravity and angular drift; it does not unlock a
different engine speed target. Coasting is physical motion: multiplayer menus neutralize controls
while the server continues it. Offline pause freezes the simulation.

Protocol **v4** serializes the complete `travelMode` instead of the former transit boolean. Prediction
restores the mode before replaying released commands, so reconciliation cannot silently reintroduce
normal flight braking. Clients still send bounded input/actions, not mode mutations or velocities.
Client/server versions must update together.

`npm run check` passed **390 tests across 35 files**, lint, TypeScript and production build. The
separate real-socket suite passed six tests, including a second pilot observing released coasting
above 350 m/s across both F settings, then NORMAL after S. Pure regressions also cover ascent,
descent, terrain braking/landing with F on/off, ordinary throttle targets, gear/reset/arrival bounds,
rejected client mode mutations and delayed prediction replay. The held reference descent remained
45.317 s, peak 800 m/s, no impact, with 11.108 s over the last 200 m.

Browser verification observed 800 m/s with V released and F / STAB ON after toggling F off/on.
A released descent also continued into the final terrain/gear braking envelope with shields and
hull at 100%. These are local gameplay observations, not WAN or broad hardware certification.

The same local ten-second held-descent load scenario was rerun with v4; it is not a separate
long-duration coasting benchmark. Node/server and clients share one process, zero added latency,
transport sizes exclude WebSocket/TCP headers:

| Clients | Actual Hz | Mean / max tick ms | Overruns | Down KiB/s/client | CPU, one core | RSS MiB | p95 input ack ms |
| ------- | --------- | ------------------ | -------- | ----------------- | ------------- | ------- | ---------------- |
| 2       | 30.00     | 0.707 / 4.111      | 0        | 34.3              | 8.5%          | 106.4   | 21               |
| 8       | 30.00     | 1.285 / 5.360      | 0        | 114.0             | 11.1%         | 82.4    | 41               |
| 16      | 29.99     | 2.392 / 15.668     | 0        | 220.4             | 15.7%         | 106.3   | 41               |

See [raw v4 load measurements](benchmarks/flight-stabilization-2026-11-02.json). Short local results
do not establish production capacity or supersede the earlier station-load spike.
