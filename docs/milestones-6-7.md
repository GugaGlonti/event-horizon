# Milestones 6–7 acceptance record

Implementation and local verification: 2026-11-01 UTC / 2026-11-02 Asia/Tbilisi. This record separates
implemented behavior, automated coverage and manual observations. It does not claim a continuous
two-player end-to-end flight without fixtures or resets.
Later [planetary approach tuning](planetary-approach.md) supersedes this record's descent timings and
protocol version; the original measurements below remain historical.

## Audit and resulting state

The starting repository already had shared flight/combat, authoritative Colyseus rooms, prediction,
remote interpolation, analytical worlds, floating origins, maps, two cameras and masked hyperspace.
Those systems were extended. The former catalogue was designed for distant viewing: Pelagos had a
620 m radius and a 28 m atmosphere, and there was no deterministic surface, gravity, landing lifecycle
or station authority.

| Requirement                 | Implemented result                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gameplay astronomical scale | Planet/moon radii and local/orbital distances increased 300×; rocky worlds 138–207 km, gas giants 330–405 km, moons 25.5–54 km. Stars are 720 km. Orbital periods, arrivals, navigation, transit and clipping were reconciled. |
| Landable reference world    | Pelagos: 186 km radius, 1.4 km relief, 14 km atmosphere, 7.8 m/s² surface gravity, survey zone and ridge landmark. Other worlds remain non-landable.                                                                           |
| Coordinates and physics     | Logical doubles, rotating body attachments and local tangent frames; patch-local GPU vertices; analytical time shared by client and server.                                                                                    |
| Terrain                     | Deterministic six-band height field; cube-sphere quadtree, worker generation, parent morphing and skirts; 150-leaf budget, 256-patch retention target and hard 384-patch cache ceiling.                                        |
| Atmosphere and flight       | Continuous altitude/density transitions, glow, horizon/day/night sky, haze and star suppression; gravity, optional 90% compensation, drag, speed/handling changes and bounded transit.                                         |
| Landing and takeoff         | Gear, slope/orientation/speed/ship-clearance checks, terrain sweeps, crash damage, grounded attachment, thrust buildup and continuous powered departure.                                                                       |
| Stations                    | Original modular Solara Orbital with one flyable hangar and two external berths; smaller industrial Vesper Outpost with an external berth. Visible structures have collision proxies.                                          |
| Docking and services        | Exclusive leases, approach/alignment guidance, manual/final assisted capture, locked docked state, repair/shields/cooling, blocked-exit holds and continuous departure beyond the hangar mouth.                                |
| Multiplayer                 | Protocol v2 intentions and replicated surface/gear/docking/occupancy state; shared authority owns contacts, landing, capture, services and departures. Disconnect/destruction cleanup preserves exclusive leases.              |
| Integration                 | Existing controller, combat, damage, navigation, maps, cameras and hyperspace retained. Weapons stop at terrain/stations and cannot fire while docked. Arrival reveal waits for complete base terrain coverage.                |
| Documentation               | README, AGENTS, architecture and multiplayer contracts updated; configuration and extension recipes in [planetary exploration](planetary-exploration.md). No dependencies added.                                               |

Terrain is approximate rocky material shading, rather than photorealism. Six octave noise supplies
plains, valleys and ridges; elevation/slope colors and distance-faded grain provide biome/roughness
variation. Skirts cover mixed-detail boundaries while patch morphing reduces subdivision popping.
The server queries the same height function without generating render meshes. This keeps one
movement authority and avoids a second physics world or coordinate system.

## Automated checks

Final `npm run check` **passed: 362 tests across 34 files**, Biome, TypeScript project checking and a
production Vite build. The suite includes real-socket integration tests.
`npm run test:integration` was also executed separately during implementation (four tests passed).

New behavioral coverage includes coordinate/pole/Three.js boundary conversion, deterministic heights
and normals, density and gravity, assisted/unassisted flight, terrain tunneling and conservative sweep
exhaustion, safe/unsafe landing, rotating attachments, takeoff, restore/replay, LOD budgets and seams.
A continuous 120 Hz test descends from 22 km to a landed state: it spends over a minute above the
atmosphere and over two minutes descending inside it. Render fixtures are not used by that test.

Station tests exercise request range, occupancy/expiry, alignment and relative speed, wall/open-mouth
contacts, moving frames, drift clearance over the hangar floor, capture, services, blocked undocking,
departure outside the entrance, destruction and disconnect cleanup. Real two-client socket tests
cover synchronized landing/takeoff, exclusive occupancy, rejected duplicate assignments, repairs,
weapon suppression and release/reclaim. A regression also preserves the selected assistance/weapon
while paused or timed-out input becomes neutral.

The build retains Vite's existing large-chunk advisory. No peer overrides or new packages were needed.

## Browser gameplay evidence

Two browser sessions used the same loopback authority. Repeatable **server-side QA fixtures** placed
pilots at orbit, entry, low-altitude and station approaches; these commands do not exist in the
production game protocol. The following actions were actually exercised through the UI/keyboard:

1. Both pilots saw the same terrain and atmosphere, descended using gear translation jets, landed
   roughly 80 m apart, then used U to take off continuously to normal flight.
2. Alpha requested Solara's hangar; Bravo saw the berth occupied and could not request it. Alpha
   flew through the entrance using W/S, captured, repaired a deliberately damaged 40% hull and
   recharged shields. Undocking freed the berth; Bravo then claimed, captured and repaired there.
3. A station approach fixture also exercised Vesper Outpost's external berth through actual W/S
   flight, final capture, services and undocking.
4. Alpha flew clear of the station and used hyperspace through Solara → Vesper → Aether → Solara.
   A near-station departure was correctly rejected until the ship backed clear. Idle menu time in
   multiplayer allowed AI damage/death; respawn/reset was used during this sequence.
5. A fresh offline session repeated Solara → Vesper → Solara after terrain-readiness gating was
   added. The tunnel remained opaque with the foreground ship/exhaust visible, and revealed complete
   terrain coverage. Both cameras, local/galaxy target selection and map focus were exercised.
6. A 390 × 844 viewport exposed overlapping instrument columns; their widths and network-status
   placement were corrected and visually rechecked. A fresh verification tab had no warning/error
   console entries after the corrected shaders/readiness implementation.

This covers the interaction stages of the requested multiplayer scenario, but **the complete
two-player orbital descent, return to space and cross-system journey was not manually flown as one
uninterrupted run**. Approach/entry/return staging used fixtures, and only one pilot's cross-system
route was manually exercised. Continuous descent is covered by simulation tests; this distinction
remains a manual verification limit. No browser reload is required by the gameplay flow.

## Measured performance

Browser values are 0.5 s rolling spot samples on this local macOS in-app browser, collected during
implementation. They are neither a sustained soak nor a hardware-independent frame-rate promise.
Geometry/texture counts are renderer resource counts; GPU allocation bytes are unavailable.

| View             | FPS / frame ms | Draw calls | Triangles | Geometries / textures | Live / cached patches |
| ---------------- | -------------- | ---------- | --------- | --------------------- | --------------------- |
| Deep space       | 120 / 8.3      | 6          | 28,552    | 100 / 5               | 6 / 70                |
| Orbit            | 120 / 8.3      | 22         | 43,144    | 144 / 3               | 54 / 202              |
| Entry            | 120 / 8.3      | 27         | 46,424    | 144 / 3               | 66 / 202              |
| Low altitude     | 120 / 8.3      | 56         | 64,536    | 139 / 3               | 150 / 202             |
| Landed           | 120 / 8.3      | 61         | 66,010    | 144 / 3               | 150 / 202             |
| Station approach | 120 / 8.3      | 55         | 66,778    | 179 / 3               | 54 / 202              |
| Hangar           | 120 / 8.3      | 50         | 66,728    | 84 / 3                | 54 / 70               |

Docking/undocking samples also included transient 61 FPS / 16.4 ms and 83 FPS / 12.1 ms before
returning toward 120 FPS. Patch generation ran in the worker with generation-time telemetry; these
spot observations preceded the final hard cache ceiling. Detailed generation/long-session GPU
profiling remains open rather than inferred from FPS.

A final landed spot check after the cache cap measured 110 FPS / 9.1 ms, 59 calls, 65,754 triangles,
150 geometries / 3 textures, 150 live / 202 cached patches and **0.7 ms** for the latest worker-built
patch. This is one patch timing, not a worst-case generation guarantee.

Local 10-second, zero-added-latency authority runs used Node 22.20 on Darwin, with server and bots
sharing a process. Physics is substepped at 120 Hz within the nominal 30 Hz authority loop. Transport
sizes exclude WebSocket/TCP headers. Complete original results and the station rerun are retained in
[benchmark JSON](benchmarks/planetary-stations-2026-11-01.json).

| Scenario                | Clients | Actual Hz | Mean / max tick ms | Overruns | Down KiB/s/client |
| ----------------------- | ------- | --------- | ------------------ | -------- | ----------------- |
| Space/combat            | 2       | 29.99     | 1.197 / 6.536      | 0        | 133.9             |
| Space/combat            | 8       | 29.99     | 3.069 / 13.108     | 0        | 310.5             |
| Space/combat            | 16      | 29.89     | 5.808 / 14.873     | 0        | 516.9             |
| Low altitude            | 2       | 29.90     | 0.929 / 7.192      | 0        | 52.2              |
| Low altitude            | 8       | 29.89     | 1.833 / 8.667      | 0        | 177.0             |
| Low altitude            | 16      | 29.90     | 3.868 / 10.119     | 0        | 333.1             |
| Station, refined sweeps | 2       | 30.00     | 0.679 / 3.156      | 0        | 53.8              |
| Station, refined sweeps | 8       | 30.00     | 1.642 / 18.711     | 0        | 218.2             |
| Station, refined sweeps | 16      | 29.70     | 4.921 / 53.798     | 1        | 460.9             |

Initial station runs had two 8-client overruns (max 131.288 ms) and one 16-client overrun (41.640 ms).
Caching transformed collision boxes and reusing sweep scratch vectors reduced mean cost. The rerun
still had one 16-client spike, so a universal stable 30 Hz capacity claim would be unjustified.
Snapshot bandwidth also remains a scaling constraint; delta/binary schema work needs further
measurement before larger sessions. These measurements were taken across implementation iterations,
not as an exact-final-commit benchmark or production/WAN capacity certification.

## Controls, configuration and remaining scope

K deploys gear; F toggles gravity compensation/leveling. Brake with S, descend with V, lift with R.
Safe landing requires gear, ≤3 m/s vertical and ≤5 m/s horizontal speed, upright orientation and
gentle terrain. U starts takeoff or undocking. P requests/captures docking, I cancels; use HUD service
buttons while docked. O enables bounded transit away from atmospheres/stations. Existing flight,
combat, C camera and M/L maps remain available. See [controls and instructions](../README.md#planetary-flight-and-docking).

Configuration/extension recipes are in [planetary architecture](planetary-exploration.md).
Only Pelagos is landable. There are no walking characters, weather, vegetation, ground NPC enemies,
economy, inventory or persistent accounts. Surface service stations are supported by reusable
definitions, but the survey base currently provides markings/landing, not services. Terrain reaches
roughly 10 m cells; extreme grazing contacts may conservatively stop a tick. Cross-platform bitwise
replay, WAN behavior, touch controls, audio/hardware matrices and long GPU/resource soaks have not
been established by this run. Existing guest/reconnect persistence remains in-memory.

The next planned feature milestone is **Missions, Contracts & Player Progression**. Before increasing
multiplayer capacity, prioritize longer station-load/latency runs, smaller snapshots and measured
adaptive terrain quality.
