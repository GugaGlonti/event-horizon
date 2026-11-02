# Hyperspace — safety, pacing and flight guidance

Galactic coordinates are light years. Heading and distance come from the same catalogue positions;
local flight and collision coordinates remain metres. Transit lasts `3.4 + distance × 0.12` seconds.
Charge, entry stretch and exit add 3.2, 3.4 and 2.1 seconds respectively. Cooldown is another four
seconds after keyboard flight returns. For example, Solara → Vesper is 48.5 LY and about 17.9 seconds
before control returns; Solara → Aether is 63.0 LY and about 19.7 seconds. Preparation/readiness holds
can extend those estimates.

The HUD stays visible through charge, stretch, transit and exit. It shows the route, traveled/total
distance, estimated remaining time, active flight time, phase and progress. Arrival waits display
HOLD. Active flight time continues during readiness holds; explicit focus/visibility suspension
freezes it. The existing bounded-delta clock prevents a suspended tab from skipping the journey.

## Departing near a planet or facility

A blocked plan closes the chart and returns to keyboard flight. An amber bearing and distance point
toward a clear launch waypoint. Follow the route using normal controls; V/R remain planet-relative
near a landable body. A clear lane offers Tab or the Engage button. Confirmation remains available
until conditions change; there is no quick-time deadline or automatic launch. The destination stays
selected and every confirmation rechecks clearance. No multiplayer permit is requested while blocked.

The pure planner compares ten bounded capsule-boundary candidates, rejects obstructed local flight
segments and chooses the shortest safe candidate found. It refreshes after 0.5 seconds or 500 m of
movement. This is a local escape planner, not a global optimal pathfinder; overlapping facilities may
require manual repositioning. If no candidate is available the HUD requests outward flight while it
recalculates. Suggestions never steer, teleport, or author authority coordinates.

Below 1100 CSS pixels the bearing becomes a compact banner, leaving hull and altitude instruments
unobstructed. Ordinary body markers and the duplicate Tab prompt yield to launch guidance. Detailed
guidance and a bounded screen bearing remain available on larger viewports.

## Collision and transition guarantees

- Departure validates the whole 5.2 km cinematic sweep and the source-side transit/preparation window.
- Bounds include maximum terrain/engineered foundation height, physical atmosphere height, rings,
  camera margin and orbital motion of every ancestor. Moving/rotating facilities use cached collision
  extents and conservative motion bounds.
- Arrival validates both sides of the holding point, including the backwards client lead-in and
  authoritative occupied-spawn offsets. Receiver clearance includes the remaining distance-scaled
  transit, readiness timeout and exit. Corridors are checked again at commit and confirmation.
- Preparation and destination-frame readiness retain independent twelve-second timeouts. The system
  switches under full tunnel coverage; a stale source frame cannot reveal the destination.
- Offline cancellation before commit keeps the source; multiplayer cancellation before admission
  keeps the source. After admission/commit, the existing recovery path keeps a safe destination. Health, reserve, statistics, camera and validated input ownership remain
  on their existing authority paths. Matching updated client/server code is required; no new wire
  fields or protocol version are introduced by this iteration.

## Cinematic presentation

The persistent 12,000-star field supplies every streak. Wider white cores, cyan shoulders and blue
halos build to full stretch by 36% of entry. Tunnel coverage starts at 80%, leaving about 1.5 seconds
of fully extended stars. Stretched exposures share the tunnel's logarithmic 80 m optical boundary;
ordinary stars remain behind celestial geometry. Hull, cockpit and exhaust retain foreground depth.

One soft exposure crest blends into three irregular cloud shells. Exit stays opaque through 30%,
then reveals the destination over 30–70%: about 0.84 seconds. The analytical coast still ends at
exactly 100 m/s. Seeded smooth noise varies camera translation/rotation, cloud drift and reflected
light between journeys. Impulses are removed before the next camera update and never feed physics.

Reduced motion suppresses trails, turbulence, recoil, dynamic FOV, exposure, animated clouds and
moving highlights. No new render targets, particle stream, textures, dependencies or audio assets
were added. Normal-flight audio ownership and gesture requirements remain unchanged.

The visual direction follows the requested modern-film cues: screen-filling white/cyan streaks,
blue cloud depth and illuminated foreground surfaces. Inspected primary references were the
[official Solo gallery](https://www.starwars.com/films/solo-a-star-wars-story-gallery) and
[Rob Bredow's production discussion](https://www.starwars.com/news/rob-bredow-making-solo-book-interview).
The effect is an original procedural interpretation; film images/footage are not bundled.

## Browser verification — 2 November 2026

Chrome checks used 1920×1080, 390×844 and 390×600 CSS viewports, with DPR 1 confirmed from the DOM
and canvas dimensions. Both chase and cockpit views completed Solara → Vesper → Aether → Solara.
Checked source alignment, entry/transit/exit, ship/cockpit visibility, route telemetry, map suppression,
map Tab focus, reset and abort. Console warning/error queries returned no entries.

The departure loop used ordinary UI controls with a finite practice encounter selected: descend at
Pelagos with V, request Vesper, receive a roughly 5.8 km blocked-lane waypoint, climb with R, observe
LAUNCH LANE CLEAR, and confirm with Tab. No QA placement or game-state injection was used. The
390×600 banner ended at y=172; hull/planetary instruments began at y=192, with altitude at y=234 and
no horizontal overflow. Pausing preserved the plan; cancellation/reset cleared it.

Native pointer capture, audible mix assessment, an OS reduced-motion browser pass, long live
multiplayer focus suspensions, simultaneous transfer saturation and a new sixty-second GPU frame
profile were not exercised. Camera/reduced-motion and async lifecycle behavior have unit coverage.
FPS readouts in screenshots are observations on this machine, not a hardware guarantee.

## Automated and load verification

Final `npm run check` passed lint, **556 tests across 40 files**, TypeScript checking and production
build, including all nine real-socket integration tests. Coverage includes all ninety directed
catalogue routes, distance/progress clocks, receiver lead-ins and holds, future moon/facility
incursions, camera continuity and nonaccumulation, seeded turbulence, input/focus and cancellation.
Vite retains its existing large-chunk advisory.

The final code revision `3143148` was measured on an Apple M2 Pro with 32 GiB RAM and Node
22.20.0. These three-second Combat join/combat runs used real SDK clients and the server in one
process on loopback, with no injected latency. A paused browser continued rendering; integration
tests had completed before measurement. Binary rates exclude WebSocket/TCP headers. Full data,
actual tick rates and limits are in [the measurement record](benchmarks/hyperspace-2026-11-02.json).

| Clients | Mean / max tick ms | Down / up KiB/s per client | p95 ack ms | CPU % of one core | RSS MiB | Overruns |
| ------- | ------------------ | -------------------------- | ---------- | ----------------- | ------- | -------- |
| 2       | 4.908 / 12.91      | 190.0 / 4.4                | 38         | 28.3              | 173.7   | 0        |
| 8       | 6.411 / 12.85      | 443.2 / 4.4                | 38         | 34.6              | 189.3   | 0        |
| 16      | 9.616 / 16.45      | 705.7 / 4.4                | 55         | 51.4              | 185.3   | 0        |

No overruns occurred in these short samples. They do not establish sustained capacity, Internet
latency, renderer performance or simultaneous-transfer capacity. Transfer behavior is covered by
real-socket integration tests; moving-boundary and extended receiver-window regressions are headless.

![Full star stretch before ignition](verification/hyperspace-stretch.jpg)

![Compact hyperspace HUD](verification/hyperspace-phone.jpg)

![Compact departure guidance with hull and altitude visible](verification/hyperspace-departure-phone.jpg)
