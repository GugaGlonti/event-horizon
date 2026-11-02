# Galaxy expansion and inhabited worlds

Implementation and verification record, 2 November 2026. This extends the original
[Milestones 6–7 record](milestones-6-7.md); its earlier measurements describe the earlier build.

## Implemented scope

The catalogue contains ten systems, 69 celestial bodies, 49 landable solid worlds/moons,
45 settlements, three capitals, 53 facilities and 80 exclusive docking pads/berths.
Each developed world has one capital, four regional cities and an outpost; highly urbanized
Concord has one capital, five regional cities and an outpost. Uninhabited worlds have no cities.
Population numbers are descriptive world metadata, not an economy or simulated ground population.

| System / stable ID     | Identity                             | Principal worlds          | Civilization       |
| ---------------------- | ------------------------------------ | ------------------------- | ------------------ |
| Solara / `solara`      | Established temperate core           | Pelagos, Cairn, Aureole   | Developed          |
| Vesper / `vesper`      | Cold industrial frontier             | Umbra, Rime, Nacre        | Outpost / colonies |
| Aether / `aether`      | Blue star, volcanic and ocean worlds | Pyra, Serein, Prism       | Colony             |
| Meridian / `meridian`  | Commercial urban core                | Concord, Brass, Regent    | Highly urbanized   |
| Kharon / `kharon`      | Desert mining frontier               | Sirocco, Slag, Ochre      | Outpost / colonies |
| Nivalis / `nivalis`    | Glacial research colonies            | Boreal, Hoarfrost, Pallor | Colony             |
| Pelagia / `pelagia`    | Oceanic agriculture and archipelagos | Thalassa, Verdant, Gyre   | Colony             |
| Ignis / `ignis`        | Basalt extraction, lava and ash      | Forge, Scoria, Furnace    | Outpost            |
| Elysion / `elysion`    | Temperate settlement network         | Elysium, Haven, Pastel    | Developed          |
| Umbra / `umbra-system` | Uninhabited remote survey            | Noctis, Hush, Penumbra    | Uninhabited        |

All systems use the existing cancellable preparation, cinematic hyperspace, safe arrival corridors,
single-use destination-bound room permits and authoritative health/statistics transfer. Protocol
system validation now derives from the shared catalogue instead of a separate three-system enum.
There are no new dependencies, package scripts or protocol fields. Protocol v4 remains the wire shape.

## Scale, terrain and environments

The existing logical double-precision coordinates, 1,024 m render-origin grid, quaternion frames,
20,000 km logarithmic depth, fixed-step flight and server authority are retained. Existing system
radii/IDs/arrival anchors remain stable. New planets range from 146 to 510 km radius, moons from
roughly 34 to 66 km, and stars from 641 to 767 km. Pelagos remains the 186 km reference world with
14 km of atmosphere and 7.8 m/s² surface gravity. It retains its tidally fixed reference frame;
other worlds rotate analytically and surface facilities follow that rotation.

`world/planetProfiles.ts` defines temperate, oceanic, desert, frozen, volcanic, barren and gas giant
profiles. Profiles supply terrain, gravity defaults, climate, atmospheric parameters and surface
palettes. Per-body overrides retain handcrafted identities. Gravity remains independently configured,
not inferred from visual radius. Gas giants/stars remain non-landable.

`planetary/terrain.ts` supplies the same seeded 3D field to physics, normals and terrain workers.
Temperate macro-noise forms continents; oceanic fields expose islands. Archetypes add dune ridges,
canyon cuts, glacial fractures, basalt relief and crater-like basins. Named landforms modify the
height field at stable geographic positions. Landing zones and city foundations grade that same
field. City foundations use a tangent plane, including its spherical radial correction, so buildings,
collision boxes and pad floors agree. Surface navigation IDs resolve to the first approach beacon; stationPose remains the physical facility frame. Conservative sweep bounds include foundation and zone heights.

Only the nearest solid body within 2.5 radii streams detailed terrain. It retains the existing
150-leaf quadtree, parent coverage, vertex morphing, seam skirts and 256/384 retention/hard cache
budgets. The distant globe remains until six terrain faces are covered, then hides to avoid redundant
full-screen shading. Destination readiness waits for the matching terrain coverage before unmasking.
Other worlds use inexpensive globe presentation. Workers terminate and cached GPU resources dispose
on body/system changes.

Oceans have a shared sea level, sun glint and view-dependent reflected sky tint. The sea is a collision
boundary; safe touchdown rejects liquid surfaces. This provides no underwater gameplay. Terrain
and ocean meshes use the same reference radius. Exterior clouds, gas bands/vortices, atmospheric
limb, sky/day/night tint and haze are approximate shaders, not a physical radiative-transfer model.

`planetary/environment.ts` classifies ocean/coast/forest/plains/mountain/polar/dune/rock/ice/basalt/lava
biomes from the same field. Climate defines temperature, moisture, weather choices, cloud coverage,
wind speed and period. Weather is a deterministic function of body seed, body-local direction and
explicit shared simulation time. Server and prediction use that wind in atmospheric drag; clients
cannot submit weather mutations. Rain, snow, dust/sandstorms and ash use bounded camera-local
particles and sky visibility/color changes. Reduced motion freezes cosmetic particle/cloud motion.
No weather entities or static buildings are synchronized every tick.

## Settlements, cities and infrastructure

Civilization classes are `UNINHABITED`, `OUTPOST`, `COLONY`, `DEVELOPED` and `HIGHLY_URBANIZED`.
`generateSettlements` makes a bounded deterministic search for dry, gentle terrain and maintains
separation between urban footprints. Preparation rejects unsuitable/overlapping sites, malformed
climates, missing/duplicate capitals and invalid surface anchors. Important cities can supply
handcrafted metadata. Port Helios is near the existing Pelagos Survey Base.

`generateCityLayout` makes a compact static arrangement of building plots, a civic landmark, public
space, service/power structures, roads, five district identities and an unobstructed spaceport.
Capital foundations span 4.8 km (6.8 km on Concord) with a 560 m civic landmark. Regional cities and
outposts use smaller footprints. Height, width, block rotation and colors vary by seed. Temperate
cities use towers; desert worlds use domes; frozen worlds use enclosed cylindrical habitats;
volcanic and barren sites use industrial/modular proportions. These remain stylized primitives.

Orbital presentation uses a low-cost urban footprint, infrastructure pattern and star-relative night
lights. Within 80 km, 24 skyline instances fade in; within 16 km, the remaining buildings fade in
progressively. Facade windows brighten at night. Ground roads/pads load nearby. Building collision
uses the same deterministic boxes as the layout, including conservative boxes around rounded hulls.
The renderer never invents authoritative terrain or collision heights.

Transport corridors are generated in a worker, following sampled terrain between suitable nearby
settlements. Long ocean crossings and excessive arc lengths are omitted. Short wet crossings get a
raised visual bridge deck. The current catalogue generates five inter-settlement links, plus each
city's local roads; this is not a comprehensive planetary road network. There are no ground vehicles.

## Spaceports, traffic and authority

Every settlement has a stable `${city.id}-spaceport` facility using the existing `StationSimulation`.
Capitals have three exclusive pads, regional cities two, outposts one. Surface anchors rotate with
the planet; docking speed includes axial velocity at the berth. Manual flight, final capture,
continuous undocking, obstruction checks, leases, repairs/shield recharge/weapon cooling, reconnect
holds and removal/death cleanup reuse orbital docking. No separate planetary docking authority exists.
The server accepts IDs and intentions, never city coordinates, occupancy assignments or repair amounts.

`AmbientTraffic` runs on the authority and in offline simulation. Only the nearest spaceport within
12 km activates NPCs, capped at its pad count and a configurable maximum of three. Couriers follow
arrival/transit/departure waypoints above the city using ordinary flight commands. They yield to craft
ahead, use normal collision/damage, never fire, and remain outside final pad corridors. Destroyed
slots wait 120 active seconds; departure clears active traffic. The existing 42-ship snapshot ceiling
includes traffic: NPCs yield capacity to guests and encounter spawning respects the total bound.
Traffic uses the existing friendly hull snapshot/presentation archetype; the `players` count still
counts connected guests. Clients interpolate these ships through the ordinary relevance-filtered
read model. Far decorative traffic is non-solid and disappears before the active traffic range.
This is not an autonomous airport/berth scheduling or transport economy simulation.

The facility budget is 16 per system, 32 ports and 512 collision boxes per facility. Only nearby
station meshes/signs load; broad-phase bounds skip distant collision boxes. `FlightWorld` retains
ownership of the shared spacecraft library. Cities and infrastructure dispose their own resources.
The pixel-ratio cap is now 1.5 after city profiling showed the previous 1.75 cap missing the frame target.
DOM instruments retain their native resolution.

## Navigation and controls

M opens the galaxy map; L the local system map; **Y opens the planetary map**. Maps share focus
containment, pause/held-input clearing and jump suppression. The local chart shows celestial bodies
and orbital stations; the planetary chart avoids crowding it with surface contacts.

The body-fixed planetary map samples shared biomes, marks the current position, capital, regional
cities, outposts, zones, landmarks and restricted areas. Its catalogue gives great-circle ground
range and targetable spaceports. Normal navigation retains direct logical range/bearing. Restricted
zones warn below their ceiling without adding factions, policing or reputation. The HUD reports
weather/visibility and restrictions at the existing telemetry cadence.

Fly with the existing controls: W/S thrust/brake, arrows pitch/roll, Q/E yaw, A/D strafe, R/V surface
lift/descent, F stabilization, O transit/approach, K gear, J selected-zone landing assist, P request or
capture, I cancel, U takeoff/undock, C cameras, Escape pause. At a city, select its **Target spaceport**,
request a pad within 2.5 km of the approach, and enter the final envelope below 45 m, 3 m/s and 7°.
Use docked services, then U to depart through the clear corridor. Space/left mouse and weapons 1–4
retain combat bindings. Selecting a city alone does not grant clearance or teleport the ship.

## Configuration and extension examples

A world entry in `expandedSystems.ts` supplies its own identity rather than cloning an entire system:

```ts
{ id: 'sirocco', name: 'Sirocco', archetype: 'desert', radius: 228000,
  civilization: 'COLONY', position: [-2400000, 120000, -1900000] }
```

1. Add a system spec with a stable ID, distinct chart/galactic position, star color, seed, description,
   civilization and three distinct world entries. `buildSystem` adds suitable moons and an arrival
   gateway; `populateSystem` applies profiles and settlements. Original handcrafted systems remain
   in `systems.ts`. The catalogue validates on import and at runtime preparation.
2. For a custom planet/moon, use `CelestialDefinition` directly. Supply a parent ID, position or
   analytical orbit, metre radius, independent gravity, rotation and seed. Moons need a planetary
   parent and a clearing orbit. Override terrain/atmosphere/climate/ocean values when needed.
3. For a handcrafted city, supply `SettlementDefinition` in `body.settlements`, with stable ID/name,
   class/purpose/style, geographic radians, foundation radius/elevation, population metadata and seed.
   `populateSystem` generates its functional spaceport. Keep developed capital/regional counts valid
   and verify dry terrain, spacing and collision/approach clearance.
4. Add stations through typed `StationDefinition` data. Orbital stations use parent-relative positions
   or orbits; surface facilities require `surfaceAnchor`. Ports define relative ship/approach poses
   and exclusive IDs. Keep normal authority and resource budgets; do not create renderer-only berths.
5. Add named natural locations through `pointsOfInterest`. Optional `landform` selects canyon,
   mountain, caldera, crater, archipelago or fracture. The shared terrain applies the modifier;
   navigation resolves its rotating position analytically. Restricted areas use geographic centers,
   metre radii and ceiling heights.

After changes run `npm run check`, the real-server integration suite and representative load/browser
checks. Test every system's arrival corridor, not just the newly added destination.

## Verification and measurements

See the acceptance results below for actual checks, figures and remaining limits. No additional
package installation or lockfile modification was needed.

Automated checks: `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` pass.
The final test run contains 500 tests across 36 files, including eight real-server integration tests.
The existing Vite application/scene large-chunk advisory remains; no warning threshold was disabled.

New behavior coverage includes all 90 ordered inter-system arrival corridors, catalogue-derived
join/travel validation, serialized snapshots for each system, seed/layout reproduction, dry city
placement, developed capital/regional requirements, malformed environment/anchor rejection, biome
classification, weather bounds, liquid landing rejection, rotating day/night and approach beacons,
exclusive surface port capture/services/continuous release, bounded non-firing traffic cleanup,
and deterministic terrain-following transport links. Existing flight/combat/input/terrain/landing,
reconciliation, cancellation, resource lifetime, room recovery and exploration tests remain enabled.

Real sockets transferred a stable guest through Meridian → Kharon → Nivalis → Pelagia → Ignis →
Elysion → Umbra, preserving hull damage and removing source entities. Two real clients additionally
verified exclusive capital-pad rejection, capture, repair and continuous undocking. The original
station, landing, combat and reconnect integration cases also ran.

Browser checks used the Codex in-app browser and Chrome with a loopback QA authority. Both clients
saw the same Port Helios and courier ships; one captured Pad 1 and the other saw the pad occupied
and disabled. Hull repair (40 → 100), shield recharge, weapon cooling and undocking were exercised
through HUD actions. [Port Helios browser capture](verification/port-helios-2026-11-02.jpg) records the city approach. Both camera modes, galaxy/planetary selection and target handoff were checked.
The planetary map fit a 390×844 viewport without horizontal overflow (366 px dialog); the viewport
was restored. No browser warning/error logs were observed during these checks. Fixture-assisted
`city` / `city-pad` positioning was used; this was not a continuous manual descent from orbit.

Before optimization, city HUD samples at 1043×1193 CSS pixels and DPR 1.75 ranged around 47–62 FPS.
After removing the covered globe draw and lowering the cap to 1.5 (1564 px canvas width), city samples
showed 118–120 FPS, about 74–86 draws, 78–84k triangles, 150 active terrain leaves and roughly
198–246 cached patches; worker builds observed around 1.5–3.2 ms. These are short HUD observations
on one Apple M2 Pro (19 GPU cores, 32 GB), not sustained frame-time percentiles or a universal
60 FPS guarantee. Browser visibility/background scheduling and warm caches affect the observations.

Load commands used `LOAD_SECONDS=5` with `npm run test:load -- 2 8 16`. Node was v22.20.0 on macOS,
Apple M2 Pro, 12 CPU cores / 32 GB. The city scenario positioned clients near Port Helios with active
traffic and firing; the low scenario used the survey area and 50 ms simulated one-way delay.
Server and bots share one process. CPU percentages are relative to one core. RSS includes bots.
Binary downstream figures are per client and exclude WebSocket/TCP framing; JSON is diagnostic.
[Raw measurements](verification/galaxy-load-2026-11-02.json) include message sizes and RSS deltas.

| Scenario    | Clients | Actual Hz | Tick mean / max ms | Overruns | CPU % | RSS MiB | Down KiB/s | Input ack p95 ms |
| ----------- | ------: | --------: | -----------------: | -------: | ----: | ------: | ---------: | ---------------: |
| City        |       2 |     29.79 |     3.052 / 27.730 |        0 |  14.9 |   143.0 |      120.9 |               44 |
| City        |       8 |     29.98 |     5.839 / 31.569 |        0 |  27.2 |   148.6 |      331.0 |               48 |
| City        |      16 |     30.00 |    11.823 / 33.528 |        1 |  50.9 |   142.6 |      615.1 |               67 |
| Low + 50 ms |       2 |     30.00 |      1.261 / 8.276 |        0 |  10.5 |   136.3 |       71.0 |              138 |
| Low + 50 ms |       8 |     29.99 |      2.322 / 9.691 |        0 |  18.3 |   144.1 |      200.0 |              131 |
| Low + 50 ms |      16 |     29.97 |     4.335 / 13.053 |        0 |  27.8 |   150.6 |      358.8 |              129 |

The 16-client city spike and substantial close-range snapshot bandwidth remain scaling concerns.
These runs do not establish WAN latency, long-lived room stability or production capacity.

## Remaining limits against the comprehensive target

- The full 26-step continuous manual acceptance journey and full original three-system browser loop
  were not repeated end-to-end in this change. Automated state/transfer coverage and fixture-assisted
  city checks do not replace that acceptance pass. Broader GPU/viewport/weather/night-side QA remains.
- Cities have large footprints and functional spaceports, but use stylized instanced primitives and
  simple seeded blocks rather than detailed authored city art, interiors or a ground population.
  District labels/purposes are metadata; there is no economy, faction/legal system or ground vehicles.
- Roads connect only suitable bounded routes (five current links), not every regional city. Bridge
  decks are visual infrastructure over the shared liquid boundary, not separate drivable physics.
- Weather/scattering, clouds, ocean reflections, fractures, craters and volcanic fissures are lightweight
  approximations. No fluid/meteorological simulation, volumetric clouds, underwater play, vegetation
  geometry or environmental damage from lava/temperature is implemented.
- Couriers provide bounded command-driven arrivals/transit/departures and avoidance; they do not
  autonomously reserve pads, land, load cargo or form a complete airport transport simulation.
- Pelagos retains the existing tidally fixed reference orientation. Rotating worlds provide changing
  sunrise/sunset; Pelagos's capital does not cycle through local days without changing its definition.
- The 60 FPS goal is supported by local samples after tuning, not certified across modern desktops.
  Longer high-density city/network soak tests, real WAN conditions and snapshot optimization remain.

Missions, Contracts & Player Progression remains the next planned milestone.
