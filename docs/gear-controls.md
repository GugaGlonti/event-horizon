# Contextual gear and flight presentation — 2026-11-02

G confirms the operation previewed by the HUD in either Travel or Combat: automatic docking,
landing, takeoff or undocking. A second press cancels an unfinished approach. Nearby free berths
have priority over landing zones; a valid selected zone otherwise takes priority over the nearest
zone. Landing needs altitude below 2.5 km, horizontal range below 1 km and relative speed below
150 m/s. Docking needs an unobstructed approach within 2.5 km and relative speed below 150 m/s.
Landings remain tied to defined landing zones, rather than arbitrary surface coordinates.

R/V/K/U/P/I/J/H are unbound. N/Tab acquire or cycle combat targets; X clears navigation and combat
targets. T cycles navigation. Tab retains contextual Travel suggestions and normal focus navigation
inside maps and focused controls. G replaces the separate procedure buttons in the HUD. Landing
and docking own gear deployment; cancellation and departure retract it automatically.

The shared station authority guides through the selected berth's moving approach marker, then
aligns and captures it. Each guided segment sweeps terrain, station geometry and nearby ships.
Movement, G, mode changes, pause/maps, inactive network input, disconnect and new obstructions cancel
unfinished approaches. Docked and undocking leases retain their existing rules. Existing validated
zone/port intentions and protocol v6 snapshots carry the procedure; clients never provide trajectories.

Engine effects use actual zero-to-full throttle and a stronger boost envelope. Each engine has
four plume layers, eighteen ion particles and eight tapered trail slices in the existing single
instanced batch. The trail is an attached exhaust wake, without retained world-space history.
Reduced motion suppresses particles and trails. Chase framing follows ship translation immediately,
then damps changes to its offset/orientation; speed no longer creates an accumulating follow gap.

## Verification

`npm run check` passed: lint, 595 tests across 43 files (including nine real-socket tests),
strict typecheck and production build. The existing Vite chunk-size advisory remains.

Behavior coverage includes automatic approach/alignment/capture, moving berths, exclusive leases,
continuous bounded movement, obstruction cancellation, manual/pause cancellation, automatic gear
retraction, focused-control/map key handling, retired keys, exhaust scaling and chase framing at
30/60/120 Hz through render-origin rebases. Real-socket tests keep pilots active during docking and
verify paused input releases an unfinished lease. Existing capture/service/undocking coverage remains.

Chrome checks used 1920×1080, 390×844 and 390×600 CSS viewports, actual render DPR 1, on an Apple M2 Pro
with 19 GPU cores. Ordinary offline flight completed G docking from the Solara spawn and G undocking.
The loopback planetary QA authority placed a multiplayer pilot at the existing low/deep fixtures:
G landing, takeoff, cockpit/chase views and manual cancellation were exercised. High-speed Travel
flight reached approximately 11 km/s with the ship remaining in frame. The Solara → Vesper → Aether
→ Solara jump route, map focus, charge abort and reset were checked. Hostile deaths during idle
arrival inspection required respawns before the next legs. These are fixture-assisted surface/speed
checks, not a claim of uninterrupted manual planetary approach. No browser warnings/errors were captured.

A warm 60-second foreground low-surface run at 1920×1080 / DPR 1 recorded 7,148 frames: median
8.3 ms, p95 11.1 ms, p99 13.8 ms. It included takeoff, landing and a camera switch; peaks were
116 draws, 95,806 triangles and 5.46 MiB of tracked planetary allocation. It mostly exercised idle
and procedure rendering, rather than sustained boosted exhaust. The DPR 1.5 reference profile,
native mouse capture, audio perception and all-system automatic docking were not tested.

Five-second real-client station load samples used Node 22.20.0, no simulated latency, and one local
process for authority plus bots. These exercise station-area flight/combat, not simultaneous docking
for every bot. Binary payloads exclude WebSocket/TCP headers; CPU is a percentage of one core.

| Clients | Mean / max tick ms | Overruns | CPU   | RSS MiB | Down KiB/s/client | p95 input ack ms |
| ------- | ------------------ | -------- | ----- | ------- | ----------------- | ---------------- |
| 2       | 1.77 / 8.28        | 0        | 12.7% | 144.0   | 78.2              | 37               |
| 8       | 4.21 / 11.30       | 0        | 26.5% | 162.7   | 296.9             | 46               |
| 16      | 8.70 / 21.46       | 0        | 47.5% | 195.5   | 615.7             | 58               |

Upstream payload was 4.5 KiB/s/client. These short local results do not establish production capacity.
