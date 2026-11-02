# Planetary exploration and station operations

Milestones 6–7 extend the existing offline and authoritative multiplayer flight simulation. There is
one coordinate convention, controller, damage model, navigation computer and hyperspace transaction.
Pelagos is the reference landable rocky world. Solara Orbital has a flyable hangar and two external
berths; Vesper Outpost has one industrial berth. All solid worlds/moons now have terrain and landing
capability; see the [galaxy expansion guide](galaxy-expansion.md) for climates, cities, surface ports,
traffic, planetary maps and current verification.

## Scale and coordinates

The old catalogue used 85–1,350 m worlds: Pelagos was a 620 m sphere with a 28 m atmosphere. The
revised catalogue multiplies planetary/lunar radii and orbital/system distances by 300. Stars use
720 km radii. Rocky worlds span 138–207 km, gas giants 330–405 km and moons 25.5–54 km. Spacecraft
retain their approximately 10 m span. Moon periods also increase by 300, preserving bounded orbital
velocities; axial spin is slowed. Pelagos is tidally fixed for the reference landing area.

Pelagos has a 186 km reference radius, up to 1.4 km of relief, a 14 km atmosphere and 7.8 m/s² surface
gravity. Its start is 22 km above the reference radius, facing the station approach. Normal cruise is
180 m/s, boost 360 m/s. Planet-relative V/R jets now reach 800 m/s aloft, while O extends into a
terrain-aware 1.4 km/s approach. The reference 22 km descent takes 45.3 simulated seconds with
deployed gear. Curvature remains visible in orbit and increasingly flat near the ground.

Logical system coordinates remain JavaScript doubles in metres. `coordinates.ts` converts latitude/
longitude, rotating body directions and local east/up/south tangent frames. `SystemRuntime` computes
bodies, stations and surface navigation points from explicit time. It does not accumulate orbital or
surface transforms. Surface attachments retain a body-local direction and orientation.

The existing 1,024 m floating-origin grid changes presentation only. Terrain subtracts each patch's
anchor in CPU double precision before uploading local Float32 vertices; patch transforms subtract the
render origin. Terrain selection uses the actual camera position. The camera uses a 0.1 m near plane,
20,000 km far plane and logarithmic depth. Every depth-tested custom foreground/world shader uses
compatible log-depth writes. The tunnel mask uses the logarithmic equivalent of an 80 m foreground
boundary, preserving ship/cockpit/exhaust while covering distant worlds.

## Deterministic terrain and atmosphere

Optional `CelestialDefinition` capabilities include gravity, physical atmosphere, terrain, landing
eligibility, zones and points of interest. Gas giants and stars cannot be declared landable. Body,
station, zone and landmark navigation IDs must be unique. Definitions stay JSON-serializable and are
validated at preparation. Lightweight deterministic weather is now implemented; vegetation meshes and
walking characters remain outside the current scope.

`terrain.ts` evaluates a seeded, continuous 3D value-noise field on unit directions. Six weighted
frequency bands create broad plains, valleys and ridges. Landing zones flatten a disc and smoothly
blend its rim into the same field. Physics, CPU normals and render workers query that exact function.
No mesh is downloaded to or generated on the server. Terrain normals use central differences across
cube faces. Elevation/slope colors, distance-faded detail and approximate roughness variation provide
rocky material variation.

`terrainLod.ts` selects six cube faces with a distance/error criterion and a 150-leaf budget. A worker
builds resolution-16 patches (configurable 8/16/32). Level 11 gives roughly 10 m cells on Pelagos.
Coarse parents remain until children are ready; finer geometry morphs from parent triangles, and
radial skirts cover mixed-level edges. The cache retains 256 patches where possible, with a hard
384-patch ceiling while drawn parents remain pinned. It evicts unused patches. Work is
serial/bounded in one worker for the nearest active terrain body; scene teardown terminates it and disposes cached GPU
geometries and the shared material. The whole planet is never generated at its finest resolution.

Physical density fades smoothly at the atmosphere boundary and decreases exponentially with
altitude. The exterior limb shader, camera-relative sky, horizon/day/night tint, terrain distance haze
and gradual star/dust suppression use the same environment. Entry changes neither scene nor logical
frame and preserves orientation and velocity. There is no entry teleport or loading screen.

## Flight, gravity and landing

`PlanetaryEnvironment` samples terrain, local frames, surface velocity, density and summed smooth
inverse-square gravity fields. Influence shells fade to zero. `FlightController` applies the shared
forces and handling; `CombatSimulation` retains the resulting velocity while adding sphere impacts.
Station geometry and terrain also obstruct weapon traces.

Tuning is in `engine/planetary/config.ts`, passed optionally into `FlightController`:

- Stabilization compensates 90% of gravity; F exposes full gravity and disables gear leveling/damping.
  Speed targets and envelopes belong to the selected travel mode and apply with F on or off.
- Atmospheric drag is density-dependent; dense air lowers nominal main-engine speed by 22% and
  reduces high-speed turning authority. This is arcade handling, not an aerodynamic simulator.
- O enables transit: up to 33× the ordinary space-speed cap (5.94 km/s cruise, 11.88 km/s boost).
  Acceleration remains bounded. Near landable planets it becomes approach, capped at 1.4 km/s with
  continuous stopping-distance braking. Forward terrain/station sweeps see ridges and structures;
  close clearance restores ordinary speed. Transit fades near other atmospheres and stations,
  is unavailable with gear/docking clearance, and requires clearing nearby ships before activation.
- K deploys gear. With assistance enabled and pitch/roll released, the craft gradually levels to the
  local horizon. Translation jets slow below 55 m and reach 2.2 m/s below 13 m center altitude.
  Release main throttle, use S to settle drift, then V to descend. Near landable planets,
  V/R select persistent surface coasting using planet-relative down/up and the shared altitude-aware
  speed profile. Release retains radial momentum; stabilization damps tangent drift rather than
  treating descent as sideways motion. Atmospheric drag, gravity and terrain/gear braking remain.
  W/S leave coasting; O selects approach/transit with gear retracted. Elsewhere V/R retain
  local translation. Descent reaches 800 m/s aloft, then slows against terrain clearance.
- J starts optional final landing assistance at the selected zone, below 2.5 km altitude, within 1 km
  horizontally and below 150 m/s, with F assistance enabled. It deploys gear, levels while preserving
  heading, cancels drift over the zone and descends using the same gear/altitude envelope. Manual
  movement, J, F, maps and all input pause paths cancel it. Traffic or invalid frames cancel it too.
- The HUD publishes profile-based ETA, descent limit and stopping distance at 10 Hz. ETA assumes
  continued descent and omits lateral travel/alignment holds. Smooth density/speed-driven airflow
  uses one cached synthesized noise loop in the existing gesture-unlocked engine mix. It shares
  engine mute/pause/ducking and bounded voice disposal. Thin shader cloud haze uses explicit world
  time and logical body-relative offsets; reduced motion stops its autonomous drift.

Landing phases are flying → approaching → landing → landed → taking-off → flying. Contact requires
gear, a landable body, vertical speed ≤3 m/s, ground speed ≤5 m/s, up alignment within approximately
16°, terrain slope below approximately 10° and clearance from another live ship. Safe contact settles
for 0.8 s. Grounded input cannot move the ship. Damage remains unchanged. Unsafe impacts retain a
bounded collision response and energy-scaled damage; high-speed sweeps cannot tunnel through terrain.
A 128-iteration grazing-sweep limit holds the last safe position instead of allowing unchecked travel.

U starts takeoff: 0.7 s of thrust buildup followed by a continuous vertical rise to about 30 m. Gear
retracts and normal controls resume. There is no surface-to-flight teleport. Altitude above terrain,
vertical/ground speed, gravity, surface heading, zone range and eligibility guidance publish at 10 Hz.
Painted survey rings and deployed gear give scale near the reference zone.

## Stations and docking

`StationDefinition` supplies stable identity, type, parent-relative position/optional orbit,
orientation, ports, approach points, collision boxes and services. The renderer instantiates the same
oriented boxes used by collision queries. Solara's segmented ring also has solid proxies. Hangar
walls/floor/roof/back leave the forward entrance open. Modular hulls, arms, signs, steady lights and a
near-range interior light give the two facilities different silhouettes. Detail hides at distance;
resources are disposed with the system scene.

`StationSimulation` owns exclusive port leases and explicit requested/approaching/aligning/docking/
docked/undocking phases. Request a berth through its HUD button or P within 2.5 km of its approach.
The assigned amber guide and range/alignment/relative-speed readouts describe that berth. Fly manually
through the hangar mouth or to an external port. Final capture requires <45 m, <3 m/s relative speed,
<7° orientation error and an unobstructed path. P engages the 2 s final assist. A manual approach
within 8 m uses the same capture checks. I cancels clearance. Unused clearances expire after 90 s.

Docked craft stay attached, cannot steer or fire, and display free hull repair, shield recharge and
weapon cooling services. There is no ammunition inventory to replenish. Each service changes the
actual ship state. U checks the departure corridor, moves out continuously for 4 s, releases the port
only when clear and restores controls. Occupied/blocked berths and exits reject conflicting actions.
Removal/destruction frees leases; a dropped approaching pilot releases clearance, while a docked
pilot retains its berth through reconnection grace. Permanent disconnect removes it.

## Multiplayer and travel

Protocol version **4** retains strict ship intentions, grounded flight state, docking state and shared
port occupancy. Clients cannot send positions, landing outcomes, damage, repair values or port
assignments. The server validates actions and owns gravity, collisions, capture, services and exits.
Flight prediction restores the full authoritative surface/lock/selected assist state and replays
movement only. Landing-assist actions contain a zone ID or cancellation, never motion or landing
outcomes. `travelMode` replaces the transit-only snapshot boolean and is restored before replay.
Paused/timed-out input cancels landing assistance; radial coasting remains physical motion while the
server runs, including in menus. Offline pause freezes it. v3 peers must update.
Other pilots interpolate the existing double-precision poses and replicated gear state. The server
never simulates render patches. Client/server builds must share the same catalogue and terrain seed.

Menus neutralize intentions while the server keeps simulating. Grounded/docked state survives menus;
there is no new menu immunity. Landing/docking preserve damage. Hyperspace requires ordinary flying
state and a swept lane clear of atmospheres, rings and station structures. Arrival corridors now use
revised planetary extents plus practical clearance instead of seven planetary radii. Existing masked
commit, abort, reconnection, camera handoff, health and input cleanup remain in use.

## Add a planet or station

For another landable world, define a rocky body/moon with gameplay radius, gravity influence,
physical atmosphere (optional), deterministic terrain seed/tuning and `landable: true`. Define zones
in radians with a finite radius/elevation and unique IDs. Keep terrain relief modest relative to body
radius. Provide a safe arrival outside its atmosphere/terrain and tune orbit periods as well as size.
Run validation/height/frame/landing tests and inspect both cameras, the LOD seam, close terrain and
server/client contacts. Do not copy rendered meshes into physics.

For another facility, add a `StationDefinition` to its system. Match visible structures with oriented
box proxies; leave a radius-6 m corridor for ship/camera clearance. Set port -Z approach orientation,
a clear waypoint, exclusive ID and optional services. `surface` station/port kinds reuse the same
operations; the current planetary survey markings are landing zones, not service stations. Validate
request/capture/undock clearances and test simultaneous occupancy and teardown. Keep total ports
within the protocol's 32-port budget.

## Verification tools

`npm run check` runs lint, unit/integration tests and a strict production build.
`npm run test:integration` exercises actual Colyseus sockets. `LOAD_SCENARIO=low npm run test:load -- 2 8 16`
and `LOAD_SCENARIO=station npm run test:load -- 2 8 16` add surface/station workloads to the ordinary
combat load test. Durations/latency remain configurable through the existing load variables.

`npm run verify:planetary` starts a **loopback-only QA server**, replacing the normal server for
verification. Its terminal accepts `deep`, `orbit`, `entry`, `low`, `land`, `station`, `hangar`,
`descent`, `status`, `damage` and `exit`. These place authority-owned test fixtures for connected pilots; they are absent
from the production server and game message schemas. Browser diagnostics show 0.5 s rolling FPS,
frame time, calls/triangles, geometry/texture counts, patch/cache count and latest worker build time.
GPU byte usage is not exposed. Fixtures are useful for repeatable views; they do not constitute proof
that an entire journey was manually flown. See the dated acceptance record for actual evidence.
