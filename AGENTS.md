# Event Horizon — agent instructions

Event Horizon is a TypeScript/React browser-based space flight and exploration game. Milestone 2 has
a playable single-player starfighter with cockpit/chase cameras. Combat, networking, AI, planetary
landings, and hyperspace are future work; add them only when the current task requests them.

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
- `src/engine/simulation`: browser/framework-independent flight math and bounded fixed-step clock.
  Three.js Vector3/Quaternion math is allowed here; rendering, React, DOM, and stores are not.
- `src/engine/input`: keyboard and pointer-lock adapter, input snapshots, event lifecycle.
- `src/features/flight`: session orchestration, configuration, interpolated presentation, cameras, HUD.
- `src/features/spacecraft`: replaceable procedural model and engine visuals; no simulation imports.
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
- Use local assets where possible. Keep client `VITE_` configuration public and explicitly typed;
  never place secrets in browser environment variables or commit `.env` files.

## State, rendering, input, and simulation

- Zustand owns discrete settings and UI state. Subscribe to individual fields with selectors.
- Never update React state every animation frame. Do not store per-frame transforms in Zustand.
- Write animated transforms to Three.js refs in `useFrame`; reuse vectors and scratch objects.
- Keep simulation independent of React, DOM events, stores, and the renderer. Use Three.js math for
  flight vectors/quaternions; do not introduce Euler-based orientation integration.
- Keep input collection, simulation integration, rendering, and HUD presentation separate.
- Use metres, seconds, radians, local forward -Z and up +Y. `FlightController.step` consumes explicit
  input snapshots and fixed dt. `FixedStepLoop` runs at 120 Hz with a 0.1-second/12-tick catch-up cap.
- Keep gameplay tuning in `features/flight/config.ts`; pass configuration into the engine.
- `FlightSession` owns simulation and browser input; presentation consumes interpolated poses.
  Cameras must never mutate simulation state. Telemetry snapshots are scalar and read-only.
- Publish HUD telemetry at 10 Hz, not at the simulation/render rate. Keep discrete state in Zustand.
- Pause and clear held keys/mouse on Escape, focus loss, visibility loss, pointer-lock release, or
  renderer error. Remove active listeners when paused and all listeners on unmount. Handle async
  pointer-lock failures/grants without resuming disposed or paused sessions.
- Preserve keyboard-only piloting when pointer lock is unavailable. Never require mouse capture to
  read controls or exit the game. Reset flight must also reset interpolation and snap the camera.
- Plan coordinate boundaries for a future floating origin without implementing one prematurely.

## Performance and resource lifetime

- Dispose of Three.js resources correctly. Fiber handles declaratively mounted geometry/materials;
  explicitly manage ownership and disposal of manual textures, render targets, and shared caches.
- Clean up event listeners and effects. Verify lifecycle logic against React Strict Mode.
- Fiber owns declaratively mounted ship/environment geometry and materials. Do not double-dispose
  shared resources or recreate geometry in the frame loop.
- Avoid per-frame allocations, unnecessary rerenders, and expensive graphics features without profiling.
- Keep device pixel ratio bounded. Add LOD, procedural planets, shaders, and post-processing as focused
  future work, backed by measurements and an actual feature requirement.

## Tests and verification

- Add meaningful behavior tests for changed math, simulation, state transitions, and bug regressions.
- Prefer pure unit tests. Do not add tests that merely mirror JSX or implementation details.
- Run relevant checks after changes. For a foundation/configuration change, run:
  `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- `npm run format` applies formatting, import organization, and safe lint fixes. `npm run check`
  runs lint, tests, and a type-checked build. Keep all scripts working.
- For visual/input changes, verify the running app, controls, narrow viewport, and browser console.
  Unit tests and successful compilation do not prove WebGL rendering works.
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
