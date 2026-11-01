# Event Horizon — agent instructions

Event Horizon is a TypeScript/React browser-based space flight, exploration and PvE combat game.
Milestone 4 extends three handcrafted systems, procedural celestial bodies, maps, floating-origin
rendering and cinematic hyperspace with shared ship simulation, continuous sphere collisions,
four weapons, cannon heat, shields/hull, targeting, timed AI patrols/respawn and JSON combat snapshots.
Multiplayer PvP/cooperative PvE, detailed terrain
and landings remain future work; add them only when the current task requests them.

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
  Three.js Vector3/Quaternion math is allowed here; rendering, React, DOM, and stores are not.
- `src/engine/physics`: pure continuous sphere sweeps and bounded mass-weighted collision response.
- `src/engine/combat`: shared command-driven ships, damage, weapons/heat, targeting, AI, pure encounter
  scheduling, detached serializable snapshots and bounded attributed gameplay events/entity lifetime;
  no React, browser, renderer, stores or feature imports.
- `src/features/combat`: encounter/world adaptation, HUD projections, effects and optional audio.
- `src/engine/input`: keyboard and pointer-lock adapter, input snapshots, event lifecycle.
- `src/engine/world`: serializable definitions, validation, analytical hierarchy/orbits, render origin.
- `src/engine/navigation`: pure target/distance/bearing logic and explicit hyperspace state machine.
- `src/features/flight`: session orchestration, configuration, interpolated presentation, cameras, HUD.
  Player engine sound consumes reusable scalar snapshots; keep audio inertia separate from physics.
- `src/features/exploration`: handcrafted catalogue, cancellable system preparation, journey orchestration,
  maps/navigation read models, hyperdrive presentation and recorded/synthesized audio adapter.
- `src/features/planets`: shared procedural surface, atmosphere and ring rendering.
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
- Keep simulation independent of React, DOM events, stores, and the renderer. Use Three.js math for
  flight vectors/quaternions; do not introduce Euler-based orientation integration.
- Keep input collection, simulation integration, rendering, and HUD presentation separate.
- Use metres, seconds, radians, local forward -Z and up +Y. `FlightController.step` consumes explicit
  input snapshots and fixed dt. `FixedStepLoop` runs at 120 Hz with a 0.1-second/12-tick catch-up cap.
- Keep flight tuning in `features/flight/config.ts` and combat/AI tuning in
  `features/combat/config.ts`; pass configuration into the engine.
- `FlightSession` composes exploration and combat, owns the player controller and browser input;
  `CombatSimulation` steps that same controller and NPC controllers once per fixed tick. Presentation
  consumes interpolated poses. Celestial colliders advance from explicit analytical time before each tick.
  Cameras must never mutate simulation state. Telemetry snapshots are scalar and read-only.
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
- Preserve T/X navigation and R/V lift. G/H acquire/clear combat targets; N/Tab cycle during flight.
  Left mouse and Space fire only while active; HUD clicks must not fire. Escape works even with a
  button focused, and Tab retains normal focus navigation inside maps and from focused controls.
- Navigation shortcuts are separate discrete listeners owned by FlightSession, including while maps
  pause movement listeners. Maps release pointer lock and contain focus. Block maps/normal steering
  during jumps; hold journeys on blur/visibility and resume explicitly. Keyboard flight returns on
  arrival; mouse recapture requires a user gesture. Preserve the inverted pitch and arrow-roll/QE-yaw
  mapping unless requested otherwise.

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
- Keep device pixel ratio bounded. Add LOD, richer terrain, adaptive quality or post-processing as
  focused future work, backed by measurements and an actual feature requirement.

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
- For visual/input changes, verify the running app, controls, narrow viewport, and browser console.
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
