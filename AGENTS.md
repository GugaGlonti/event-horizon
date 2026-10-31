# Event Horizon — agent instructions

Event Horizon is a TypeScript/React browser-based 3D flight and space simulator. The current scope is
Phase 1: a working orbital scene and maintainable foundation. Do not implement major gameplay systems
unless the current task asks for them.

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
- `src/engine/simulation`: pure, framework-independent simulation/animation math.
- Add `src/engine/input` when real input needs appear; keep input collection separate from simulation.
- `src/components/ui`: reusable DOM UI with no feature or engine dependencies.
- `src/stores`: low-frequency shared state. `src/hooks`: reusable subscriptions and UI hooks.
- `src/styles`: Tailwind entry point and shared visual styles.
- `tests`: behavioral unit tests. `docs/architecture.md`: extension guidance and tradeoffs.
- Engine code must not import features or app. Avoid circular imports and broad barrel files.
- Feature-to-feature composition belongs at an explicit composition point such as `SpaceScene`.

## Coding and component conventions

- Maintain strict TypeScript typing. Do not weaken configuration or add `any` to bypass errors.
- Use small focused modules, composition, function components, and explicit type-only imports.
- Use PascalCase component files; camelCase other module, function, and hook names.
- Prefer named exports. The lazy scene uses a default export for `React.lazy`.
- Use `@/` source aliases, two-space indentation, LF, and roughly 100-character lines.
- Keep types near their owner; create shared type modules only when multiple modules need them.
- Use semantic HTML, accessible names, keyboard-visible focus, and responsive layouts.
- Respect reduced-motion preferences. Explicit user choices may override the default.
- Use local assets where possible. Keep client `VITE_` configuration public and explicitly typed;
  never place secrets in browser environment variables or commit `.env` files.

## State, rendering, input, and simulation

- Zustand owns discrete settings and UI state. Subscribe to individual fields with selectors.
- Never update React state every animation frame. Do not store per-frame transforms in Zustand.
- Write animated transforms to Three.js refs in `useFrame`; reuse vectors and scratch objects.
- Keep simulation logic independent of React, Three.js, DOM events, and the renderer where practical.
- Keep input collection, simulation integration, rendering, and HUD presentation separate.
- Express velocities per second and angles in radians. The existing capped visual delta is not a
  fixed-timestep gameplay clock. Add a bounded fixed-step accumulator only when implementing physics.
- Plan coordinate boundaries for a future floating origin without implementing one prematurely.

## Performance and resource lifetime

- Dispose of Three.js resources correctly. Fiber handles declaratively mounted geometry/materials;
  explicitly manage ownership and disposal of manual textures, render targets, and shared caches.
- Clean up event listeners and effects. Verify lifecycle logic against React Strict Mode.
- Drei owns the lifecycle of its orbit controls. Do not double-dispose shared resources.
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
