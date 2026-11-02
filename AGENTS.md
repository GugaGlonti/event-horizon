# Event Horizon — agent instructions

Event Horizon is a TypeScript/React browser space flight, exploration and multiplayer combat game.
Milestones 6–7 now include ten systems, shared archetype terrain/oceans/climates/weather, civilizations,
deterministic cities, planetary charts, surface spaceports and bounded ambient traffic. Existing
Pelagos landing, orbital hangars, offline flight and authoritative multiplayer remain supported.
Missions, contracts and player progression are next. Do not add economy, inventory or characters
without a task requirement. Current scope and verification limits live in docs/galaxy-expansion.md.

## Before changing code

- Inspect existing code, `package.json`, README, and relevant tests before editing.
- Prefer extending existing patterns over introducing new ones.
- Keep the change focused. Avoid large, unrelated refactors and speculative abstractions.
- Use npm. Preserve the lockfile and install only immediately necessary dependencies.
- Do not create empty feature directories, placeholder providers, or generic managers for future work.

## Module boundaries

- `src/app`: application composition and error boundaries. Keep domain logic out.
- `src/features/<feature>`: feature-owned components, controllers, logic, and types when needed.
- `src/engine/rendering`: renderer policy and common graphics infrastructure.
- `src/engine/audio`: shared gesture-unlocked normal-flight mix, channel headroom and cue ducking.
- `src/engine/simulation`: browser/framework-independent flight math and bounded fixed-step clock.
  Use engine/math operations; Three.js, React, DOM, features and stores are forbidden in authority.
- `src/engine/math`: small renderer-independent vector/quaternion operations. Preserve aliasing safety.
- `src/engine/network`: shared versioned/runtime-validated protocol, bounded input/prediction/snapshot
  buffers and pure MultiplayerWorld authority. No browser, React, Three.js, stores or feature imports.
- `server`: Colyseus room lifecycle, configuration, clocks, validated messages, travel/reconnect and metrics.
- `src/features/multiplayer`: browser transport, prediction/read-model adapter, interpolation and UI.
- `scripts/loadTest.ts`: real-client load harness; document actual measurements and their limits.
- `src/engine/planetary`: shared deterministic height/density/gravity queries, body/tangent frames,
  landing state/telemetry and configurable flight tuning. No render patches, browser or stores.
- `src/engine/stations`: serializable facilities, oriented-box sweeps, docking leases and services.
  Surface facilities follow body rotation. AmbientTraffic owns up to three nearby friendly couriers;
  use shared flight commands/collisions and yield the 42-ship wire budget to guests.
- `src/features/stations`: modular meshes/signage/lights and docking presentation only.
- `src/engine/physics`: pure continuous sphere sweeps and bounded mass-weighted collision response.
- `src/engine/combat`: shared command-driven ships, damage, weapons/heat, targeting, AI, pure encounter
  scheduling, detached serializable snapshots and bounded attributed gameplay events/entity lifetime;
  no React, browser, renderer, stores or feature imports.
- `src/features/combat`: encounter/world adaptation, HUD projections, effects and optional audio.
- `src/engine/input`: keyboard and pointer-lock adapter, input snapshots, event lifecycle.
- `src/engine/world`: serializable definitions, validation, analytical hierarchy/orbits, render origin.
  systems.ts composes the original catalogue, expandedSystems.ts and planetProfiles.ts. Existing
  settlementAnchors.ts records pin named surface locations across generation revisions.
- `src/engine/navigation`: pure target/distance/bearing logic and explicit hyperspace state machine.
- `src/features/flight`: session orchestration, configuration, interpolated presentation, cameras, HUD.
  Player engine sound consumes reusable scalar snapshots; keep audio inertia separate from physics.
- `src/features/exploration`: handcrafted catalogue, cancellable system preparation, journey orchestration,
  maps/navigation read models, hyperdrive presentation and recorded/synthesized audio adapter.
- `src/features/planets`: shared celestial/atmosphere rendering, terrain workers/cache, surface
  facilities and HUD. Keep terrain heights shared with authority, never derived from a rendered mesh.
- `src/features/spacecraft`: bundled ship models, shared asset lifetime and engine visuals; no simulation imports.
- `src/components/ui`: reusable DOM UI with no feature or engine dependencies.
- `src/stores`: low-frequency shared state. `src/hooks`: reusable subscriptions and UI hooks.
- `src/styles`: Tailwind entry point, theme tokens, custom variants, and global base defaults.
- `tests`: behavioral unit tests. `docs/architecture.md`: extension guidance and tradeoffs.
- Engine code must not import features, stores, or app. Avoid circular imports and broad barrel files.
- Feature-to-feature composition belongs at an explicit composition point such as `SpaceScene`.

## Coding and component conventions

- Maintain strict TypeScript typing. Do not weaken configuration or add `any` to bypass errors.
- Use small focused modules, composition, function components, and explicit type-only imports.
- Use PascalCase component files; camelCase other module, function, and hook names.
- Prefer named exports. The lazy scene uses a default export for `React.lazy`.
- Use `@/` source aliases, two-space indentation, LF, and roughly 100-character lines.
- Keep types near their owner; create shared type modules only when multiple modules need them.
- Use semantic HTML, accessible names, keyboard-visible focus, and responsive layouts.
- Prefer Tailwind utilities in components for layout, spacing, typography, colors, responsive styles,
  interaction states, focus, and reduced motion. Keep CSS for theme tokens, shared variants, global
  defaults, or effects that are clearer as custom CSS. Do not recreate utility styles with `@apply`
  component classes. Reuse components or static class strings for repeated utility combinations.
- Respect reduced-motion preferences. Explicit user choices may override the default.
- Keep interface styling consistent with the 1980s flight terminal: phosphor/amber theme tokens,
  open flight instruments, framed maps/menus, the bundled mono font, and shared `InstrumentButton`
  states. Keep essential readouts legible and CRT texture static; do not add flicker or fake fuel,
  damage, or weapon telemetry.
- Use local assets where possible. Keep client `VITE_` configuration public and explicitly typed;
  never place secrets in browser environment variables or commit `.env` files.

## State, rendering, input, and simulation

- Zustand owns discrete settings and UI state. Subscribe to individual fields with selectors.
- Never update React state every animation frame. Do not store per-frame transforms in Zustand.
- Write animated transforms to Three.js refs in `useFrame`; reuse vectors and scratch objects.
- Update frame-rate scalar shader uniforms through the mounted ShaderMaterial ref. Fiber copies
  uniform wrappers from props; updating the original numeric prop wrapper does not update the GPU.
- Keep simulation independent of React, DOM events, stores, and the renderer. Use engine/math for
  flight vectors/quaternions; do not introduce Euler-based orientation integration.
- Keep input collection, simulation integration, rendering, and HUD presentation separate.
- Use metres, seconds, radians, local forward -Z and up +Y. `FlightController.step` consumes explicit
  input snapshots and fixed dt. `FixedStepLoop` runs at 120 Hz with a 0.1-second/12-tick catch-up cap.
- Shared flight tuning lives in `engine/simulation/config.ts`, combat/AI tuning in
  `engine/combat/config.ts`, and the catalogue in `engine/world/systems.ts`. Feature configuration
  explicitly re-exports shared values and owns presentation tuning. Never import features on the server.
- Offline `FlightSession` composes exploration and combat, owns the player controller and browser input;
  `CombatSimulation` steps that same controller and NPC controllers once per fixed tick. Presentation
  consumes interpolated poses. Celestial colliders advance from explicit analytical time before each tick.
  Cameras must never mutate simulation state. Telemetry snapshots are scalar and read-only.
- In multiplayer, Colyseus runs a configurable 30 Hz authority loop with shared physics substeps;
  each recipient defaults to 20 Hz relevance-filtered snapshots. MultiplayerWorld owns players/AI,
  combat, celestial time, safe spawns, statistics and restrictions. Clients send bounded intentions,
  never position, damage, hit or configuration mutations. Validate messages and protocol versions.
- The browser predicts flight only, restores complete authoritative state and replays unacknowledged
  inputs. Never replay weapons/effects during reconciliation. Preserve bounded input/snapshot buffers,
  sequence acknowledgement, neutral timeouts and rate limits. Keep correction smoothing in presentation.
- Maps, pause, blur and visibility loss clear multiplayer fire/steering immediately but do not pause
  server time or grant menu immunity. Server death/respawn controls health. Keep remote ships on the
  shared asset/origin path; name/readout publication remains at 10 Hz. Replicate compact archetypes.
- Travel uses single-use destination-bound server permits and preserves health/statistics. Keep the
  source until admission, adopt a safe destination after admission, and never let late async work
  resurrect a cancelled/disposed journey. Reconnect must recover transfer holds or cleanly rejoin.
- Guest IDs/tokens are temporary, per-tab and in memory. Do not add accounts or persistence without a
  task requirement. Never claim production/large-scale capacity from short local load tests.
- Publish flight/combat HUD telemetry at 10 Hz, not at the simulation/render rate. Keep discrete state
  in Zustand. Keep collision/gameplay coordinates independent of render-origin changes. Bound ships,
  projectiles/effects/events and audio voices; clear encounters and reinforcement timers on
  departure/reset/disposal. Encounter delays consume active fixed ticks; preserve patrol slot IDs on
  respawn and revalidate spawn clearance against the current world. Practice remains finite. Preserve player
  damage across jumps, and clear held fire on every pause path.
- Pause and clear held keys/mouse on Escape, focus loss, visibility loss, pointer-lock release, or
  renderer error. Remove active listeners when paused and all listeners on unmount. Handle async
  pointer-lock failures/grants without resuming disposed or paused sessions.
- Preserve keyboard-only piloting when pointer lock is unavailable. Never require mouse capture to
  read controls or exit the game. Reset flight must also reset interpolation and snap the camera.
- Keep logical double-precision system coordinates independent of the 1024 m render-origin grid.
  Rebase the camera's existing position before follow damping. Compute HUD distances in logical space.
  Cull/zero far celestial/beacon render transforms; camera-relative effects must remain bounded.
- World definitions must stay JSON-serializable with stable system/body IDs, parent-relative positions
  or explicit analytical orbits, distinct finite galactic coordinates, normalized spawn quaternions,
  and safe arrival anchors. Validate at the preparation boundary. Celestial time is explicit and
  pauses with flight/maps; no random or
  frame-accumulated moon transforms. Parent axial spin must not drag children around.
- Keep hyperspace timing independent of rendering, audio, promises and stores. ExplorationSession
  owns abort/generation tokens and atomically commits prepared systems under the opaque tunnel.
  Gate exit progress on the matching destination scene's first frame; stale source frames cannot
  release the mask. Preserve camera-relative pose/FOV across handoff. Late async results must not
  revive cancelled/disposed journeys. Before commit, failure retains the source; after commit, abort
  holds a safe destination. Reset cancels before respawning.
- Jump poses follow bounded analytical paths outside fixed-step physics. Derive headings from shared
  galactic coordinates; check swept departure/arrival corridors including rings and moon motion. Match
  exit velocity and throttle at the physics handoff. Keep foreground ship/cockpit/exhaust visible;
  order the tunnel mask after celestial transparency and before star trails and exhaust.
- Preserve T/X navigation and R/V lift. G/H acquire/clear combat targets; N cycles during Combat. Tab confirms contextual actions during flight.
  Left mouse and Space fire only while active; HUD clicks must not fire. Escape works even with a
  button focused, and Tab retains normal focus navigation inside maps and from focused controls.
- Navigation shortcuts are separate discrete listeners owned by FlightSession, including while maps
  pause movement listeners. Maps release pointer lock and contain focus. Block maps/normal steering
  during jumps; hold journeys on blur/visibility and resume explicitly. Keyboard flight returns on
  arrival; mouse recapture requires a user gesture. Preserve the inverted pitch and arrow-roll/QE-yaw
  mapping unless requested otherwise.

## Planetary and docking contracts

- Use shared `engine/planetary/config.ts` for gravity assistance, drag, atmospheric handling, transit
  and precision gear jets. Planetary forces run inside the existing FlightController, once per tick.
  Keep the terrain response velocity when feeding corrected motion through the sphere solver.
- Surface state includes a rotating body-local anchor/orientation. Never teleport to simulate entry,
  landing or takeoff. Landing requires safe velocity/attitude/slope and nearby-ship clearance.
- StationSimulation owns exclusive leases, capture, services and continuous undocking. Free leases on
  removal/destruction. Keep docked leases through reconnect grace; release approaching disconnects.
  Flight-locked ships cannot fire or steer. Repair only live docked ships through validated intentions.
- Planetary approach uses stopping-distance terrain/station lookahead. V/R are planet-relative near
  landable worlds and select persistent surface coasting, with a shared altitude/gear speed envelope.
  F selects Travel/Combat; both retain stabilization/compensation. Travel automatically selects transit/approach.
  Weapons and shields are offline in Travel; Combat shares energy with boost. Tab suggests validated operations. Release retains radial momentum; damp tangent
  drift without erasing coasting. W/S leave surface mode; reset, relocation, docking and grounding
  clear it. Keep terrain/station lookahead active while coasting. Preserve ordinary space controls.
  Landing assist is a validated selected-zone intention, not client-authored motion; keep it in full
  snapshots/replay. Cancel on manual movement, every input-mode pause callback, maps and disconnect.
  ETA is a 10 Hz estimate of continuing the shared descent profile, not guaranteed arrival time.
- Protocol v6 transports validated flight-mode intentions, shared energy, automatic handling/traffic clearance,
  full surface/lock/landing-assist state, docking state and bounded shared occupancy. Keep
  positions as doubles; clients never assign coordinates, landing outcomes or repairs. Share seeds.
- Civilization/settlement generation and biome/weather queries remain pure engine/planetary code.
  Validate developed capitals/regional counts, dry/sloped placement, spacing, surface anchors and budgets.
  City collision boxes come from the same seeded layout as rendering. Terrain grading and ocean
  boundaries remain shared; liquid contacts cannot ground a ship. Surface port velocity includes spin.
  Weather uses body-local coordinates, seeds and explicit world time; never use Date.now/Math.random.
- Ambient traffic is authoritative near cities (one/two/three per outpost/regional/capital, maximum
  three overall), command-driven and non-firing. It uses the existing friendly hull archetype; the
  network players count remains connected guests. Keep total ships <=42, clear traffic on departure,
  bound destroyed-slot cooldowns, and keep distant decorative traffic outside the gameplay range.
- Navigation IDs span bodies, stations, cities, zones and landmarks. Keep chart/HUD ranges and safe hyperspace
  corridors consistent with changed radii, physical atmospheres and station collision geometry.
- Use logarithmic depth for the 20,000 km far plane. Custom world/foreground shaders must use matching
  vertex/fragment depth chunks and common helpers. The atmosphere sky must depth-test behind solid
  geometry; the hyperspace mask uses an 80 m logarithmic foreground boundary.
- Copy scalar quaternion components across engine/Three boundaries. Three.multiply reads private
  fields; do not pass an engine quaternion into it. Test actual renderer-math boundary conversions.
- QA fixtures live only in scripts/planetaryVerification.ts / planetaryFixtures.ts, never game protocol
  or normal authority. Distinguish fixture-assisted browser checks from continuous manual flight.
  Use LOAD_SCENARIO=low/station/descent for representative load and record actual hardware/viewport limits.

## Performance and resource lifetime

- Dispose of Three.js resources correctly. Fiber handles declaratively mounted geometry/materials;
  explicitly manage ownership and disposal of manual textures, render targets, and shared caches.
- Clean up event listeners and effects. Verify lifecycle logic against React Strict Mode.
- Fiber owns declarative exhaust/environment resources. FlightWorld owns the shared spacecraft GLB
  library; retain it across jumps, suppress per-ship disposal and release/evict it on final teardown.
  Do not double-dispose shared resources or recreate geometry in the frame loop.
- Each SystemScene explicitly owns/disposes its shared sphere geometry; primitive geometry attachments
  are external resources. Fiber disposes body materials/rings and per-scene declarative resources.
  Stop/disconnect recorded and synthesized audio voices on abort. Cache decoded local stems across
  jumps; invalidate pending playback on cancellation and abort fetches/release buffers/context on
  teardown. Keep audio optional and independent of the journey clock. Keep effects reusable across jumps.
- `FlightSession` owns the shared normal-flight audio mix. Engine/combat adapters receive it at
  composition and dispose only their own voices; close the shared context after both adapters.
  Keep three active enemy engine loops, with fading voices included in the overall cap. Project
  audio in logical space and consume muted/paused effects without replaying them. Keep weapon/hit
  cues above the engine bed.
- Avoid per-frame allocations, unnecessary rerenders, and expensive graphics features without profiling.
- Keep device pixel ratio bounded. Terrain uses a 150-leaf quadtree, 256-patch retention target and hard 384-patch cache ceiling;
  retain parent coverage, morph new detail and cover mixed LOD seams. Stream only the nearest solid
  body within 2.5 radii, keep a globe until roots cover it, then hide the redundant globe. Cities retain
  orbital footprints; fade skyline/full batches at 80/16 km and generate transport ribbons in a worker.
  Facilities are capped at 16/system, 32 ports/system and 512 boxes/facility. DPR is capped at 1.5. Terminate workers and dispose
  cached resources on teardown. Add richer terrain/adaptive quality only with measured need.

- Surface revision 2 shares seeded height/biome rules between authority, terrain workers and orbital
  map baking. Keep the height-only physics path independent of cover/scenery queries. Preserve the
  authored anchor distinction: generated sites require suitable natural terrain; authored sites
  require dry, safe engineered foundations. Never derive authority height from a GPU map.
- SystemScene owns PlanetGeneration's two workers and cancels jobs on teardown. Queue short atlas
  strips behind visible terrain, tag requests with the shared surface revision and discard cancelled
  results. Published textures must survive until their React replacement commits.
- Scenery streams at most 32 projected 256 m cells, with 4,096 instances maximum (current kit 3,072).
  Keep scatter decorative, exclude facilities/roads/liquids and fade into distant canopy shading.
  Only the nearest city streams up to 16 full-detail blocks. Shared building recipes own both mesh
  parts and collision boxes; preserve pad frames and keep the 512-box facility ceiling.
- Track incremental planetary GPU allocation estimates, including texture mipmaps, against 32 MiB.
  Keep the 180-draw/350k-triangle reference budget. Profile 60-second foreground frame intervals at
  1920x1080 CSS / DPR 1.5; separate cold generation and never infer universal hardware guarantees.

## Tests and verification

- Add meaningful behavior tests for changed math, simulation, state transitions, and bug regressions.
  Include cannon heat hysteresis/range, AI reaction/retreat constraints, serializable state/events and
  safe all-system reinforcement scheduling when those contracts change. See docs/milestone-4.md for
  the consolidated acceptance record; keep it and README current.
- Prefer pure unit tests. Do not add tests that merely mirror JSX or implementation details.
- Run relevant checks after changes. For a foundation/configuration change, run:
  `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- `npm run format` applies formatting, import organization, and safe lint fixes. `npm run check`
  runs lint, tests, and a type-checked build. Keep all scripts working.
- For multiplayer changes, run real-server integration tests and 2/8/16-client load tests where feasible;
  report tick time, binary bandwidth, latency, CPU/RSS and overruns. For visual/input changes, verify the running app, controls, narrow viewport, and browser console.
  Unit tests and successful compilation do not prove WebGL rendering works.
- For exploration changes, exercise target selection and the Solara → Vesper → Aether → Solara
  journey, both cameras, map suppression/focus, abort/reset, and the fully masked system handoff.
- Report checks actually executed and any verification limits. Never claim unexecuted checks passed.

## Dependencies and documentation

- Avoid unnecessary dependencies. Evaluate version and peer compatibility before installation.
- Use current stable, mutually compatible versions; keep React and Fiber compatibility aligned.
- Three.js is pinned to r182 because Fiber 9 constructs `Clock`, deprecated by newer Three releases.
  Remove the pin only after checking a stable Fiber release and verifying a clean browser console;
  update the matching Three types and README together.
- Never force peer resolution or disable audits to hide an incompatibility.
- Commit `package-lock.json` with dependency changes. Do not introduce another package manager.
- Keep README accurate, including commands, prerequisites, roadmap progress, and known limitations.
- Update architecture notes when responsibilities, resource ownership, or simulation boundaries change.
- Update these instructions when repository conventions change. Do not describe unimplemented systems
  as existing functionality.
