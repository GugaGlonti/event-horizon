# Event Horizon

A browser-based space flight, combat, and exploration game, built one system at a time.

**Milestone 2 — Spacecraft flight.** Pilot the original Kestrel starfighter near the ringed world Aster.
Adjust throttle, bank and turn, engage boost, and switch between chase and cockpit views. Illuminated
navigation rings and local dust provide movement references. This milestone is single-player free
flight; combat, networking, AI, landings, and hyperspace are not implemented.

## Stack

| Technology                           | Role                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| TypeScript 7, strict mode            | Application, simulation, and tooling types                        |
| React 19 + Vite 8                    | UI, development server, production bundling                       |
| Three.js 0.182 + React Three Fiber 9 | 3D math and WebGL 2 rendering                                     |
| Drei 10                              | Available Three.js utilities; no extra flight dependency required |
| Zustand 5                            | Discrete session choices and sampled HUD telemetry                |
| Tailwind CSS 4                       | HUD, menus, responsive layout, interaction states                 |
| Biome 2 + Vitest 5                   | Formatting, linting, and Node-based unit tests                    |

Resolved versions are in `package-lock.json`. React and Fiber must be upgraded together; see the
[Fiber compatibility guide](https://r3f.docs.pmnd.rs/getting-started/introduction). Three.js is pinned to
r182 because stable Fiber 9 still constructs `Clock`, deprecated in r183 and later
([upstream issue](https://github.com/pmndrs/react-three-fiber/issues/3741)). Reevaluate the pin when a
stable Fiber release migrates to `Timer`, and update the Three types together.

## Start flying

Requires **Node.js 22.12+ on the 22.x line, or Node.js 24+**, npm 10+, and a desktop keyboard with a
modern WebGL 2 browser. Hardware acceleration is recommended. `.nvmrc` selects Node 22.

```bash
nvm use                    # optional, with nvm
npm ci
npm run dev
```

Open the Local URL printed by Vite (normally `http://127.0.0.1:5173`). Choose **Fly with mouse** to
request pointer lock, or **Keyboard flight** to steer with arrows. The ship starts stationary in chase
view. Hold W to raise throttle; releasing W holds that setting. There are no API keys, external models,
fonts, textures, or services to configure. No new dependencies were needed for this milestone.

## Controls

| Input          | Action                                                   |
| -------------- | -------------------------------------------------------- |
| Mouse movement | Pitch/yaw; steering gently recenters when movement stops |
| Arrow keys     | Pitch/yaw in either mode; ↑ nose down, ↓ nose up         |
| Q / E          | Roll left/right                                          |
| W / S          | Increase/decrease throttle                               |
| Shift          | Hold for temporary engine boost                          |
| Space          | Hold to brake; stored throttle is preserved              |
| C              | Switch chase/cockpit camera                              |
| F              | Toggle flight assistance                                 |
| Esc            | Pause simulation and release the mouse                   |

**Controls** opens the pause/controls reference. The camera and assistance also have keyboard-focusable
HUD buttons. **Reset flight** in the briefing returns the craft and camera to the starting point,
restores engine reserve, and clears momentum; camera and assistance preferences are preserved.

Boost lasts about four seconds from a full reserve and recharges after a delay. After depletion,
release Shift and let reserve reach at least 18% to rearm. Excess boost speed decays back toward the
cruise limit. Braking overrides thrust and boost; engines accelerate again when the brake is released
if throttle is still open. Flight assistance damps lateral drift and angular momentum. With assistance
off, the ship retains drift and rotation; use counter-steering or the brake to regain control.

Escape, window blur, hiding the tab, pointer-lock release, and renderer errors pause flight. Resume is
explicit. If mouse capture is blocked or unsupported, choose Keyboard flight. Mouse capture requires a
user gesture and depends on browser support ([Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)).

## Commands

| Command              | Behavior                                            |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Vite server with hot module replacement             |
| `npm run build`      | Strict type check, then production build to `dist/` |
| `npm run preview`    | Serve the built `dist/` locally; build first        |
| `npm run lint`       | Biome formatting/import/lint checks                 |
| `npm run format`     | Apply formatting, import organization, safe fixes   |
| `npm run typecheck`  | Check app, tests, and Vite configuration            |
| `npm run test`       | Run all unit tests once                             |
| `npm run test:watch` | Interactive test runner                             |
| `npm run check`      | Lint, tests, and a type-checked production build    |

CI runs npm ci, lint, tests, and the production build. Hosting is not configured; `dist/` can be served
as static files. The preview server is for local verification.

## Structure and architecture

```text
src/
  app/                             Composition, session lifetime, renderer error boundary
  components/ui/                   Shared DOM messages and icons
  engine/
    input/FlightInputManager.ts    Keyboard/pointer-lock adapter and cleanup
    simulation/FlightController.ts Flight state, quaternion integration, thrust, damping, boost
    simulation/FixedStepLoop.ts    Bounded fixed-timestep accumulator
    simulation/flightTypes.ts      Input, tuning, read-only scalar telemetry contracts
    rendering/SceneCanvas.tsx      Renderer policy and configurable camera startup
  features/
    flight/
      config.ts                    Central flight, input, timing, camera, environment tuning
      FlightSession.ts             Input → fixed ticks → interpolated render pose → sampled HUD
      camera/                      Presentation-only camera following
      components/                  Flight world, cockpit framing, HUD, controls menu
    spacecraft/components/         Original procedural model and engine plumes
    space/components/              Scene composition, stars, stationary environment references
    planets/components/            Reference ringed planet
  hooks/                           Reduced-motion and visual-rotation subscriptions
  stores/                          Flight UI state, sampled telemetry, visual scene preferences
  styles/                          Tailwind theme/variants and global defaults
public/assets/                     Local favicon
tests/                            Simulation, timing, input, session/camera, scene-state tests
docs/architecture.md              Ownership, units, timing, resource and extension guidance
AGENTS.md                          Instructions for AI-assisted development
```

Simulation uses metres, seconds, and radians. Local forward is **-Z**, up **+Y**, right **+X**.
`FlightController` uses Three.js vectors/quaternions but has no React, DOM, WebGL, store, clock, or
randomness dependency. It accepts a configuration and input snapshot with explicit dt. Its internal
vectors are private; render poses are copied and telemetry contains only read-only scalar values.

`FlightSession` runs simulation at **120 Hz**, caps catch-up to **0.1 seconds / 12 ticks**, and discards
suspension backlog. Rendering interpolates previous/current transforms. The camera follows that render
pose and cannot affect physics. The HUD receives snapshots at **10 Hz**. No per-frame React state
updates or transient transforms are sent through Zustand. See [architecture notes](docs/architecture.md).

The procedural model is separate from simulation and can later be replaced with a GLTF model facing
-Z. Chase view damps position/orientation, fits narrow screens, and varies FOV with speed. Cockpit view attaches to the
interpolated craft pose and hides the external model. Reduced motion disables speed-based FOV and
automatic planet rotation; steering and essential ship motion remain available.

## Roadmap

### Phase 1 — Foundation

- [x] Modular architecture and basic scene
- [x] Strict tooling, unit tests, CI, contributor documentation

### Phase 2 — Flight

- [x] Keyboard and pointer-lock input, keyboard-only fallback
- [x] Throttle, acceleration, inertia, quaternion steering, brake, boost, optional assistance
- [x] Fixed-step simulation with interpolated rendering
- [x] Chase and cockpit cameras, procedural spacecraft, engine glow
- [x] Responsive flight HUD, pause, controls reference, reset
- [ ] Wider hardware playtesting and flight-feel tuning

### Phase 3 — Planetary Systems

- [ ] Procedural planets and atmospheres
- [ ] Richer space environments
- [ ] Planetary approach/departure and landings

### Phase 4 — Hyperdrive

- [ ] Charging, warp effects, star-system navigation, cinematic transitions

### Phase 5 — Polish

- [ ] Audio, visual effects, performance profiling, improved UI/UX

Combat, multiplayer, and AI will be separate future milestones. The simulation boundary supports later
server reuse; no authority, synchronization, prediction, or reconciliation protocol is implemented.

## Development conventions

- Inspect existing code and `AGENTS.md`; extend patterns and avoid unrelated refactors.
- Keep components small and feature-local; use composition and colocated types.
- Maintain strict typing, explicit type imports, `@/` aliases, two-space indentation, and ~100-column lines.
- Prefer Tailwind utilities for UI layout, colors, typography, states, and responsive behavior. Keep CSS
  for theme tokens, variants, global defaults, and effects that are clearer there. Use inline styles
  only for runtime values such as a telemetry meter's scale.
- Keep gameplay parameters in `features/flight/config.ts`. Do not couple simulation to browser input,
  React, the renderer, or UI stores. Never integrate spacecraft orientation using Euler angles.
- Reuse scratch vectors/quaternions in hot paths. Fiber owns declarative geometries/materials; manually
  created GPU resources need explicit, documented disposal ownership.
- Test behavior and regressions. Verify visual/input changes in a browser. Report checks actually run.
- Keep README, architecture notes, and agent instructions accurate.
- Use npm and commit the matching lockfile. Add dependencies only for an immediate requirement.

No environment file is required. Future browser configuration must use `VITE_`, be explicitly typed in
`src/vite-env.d.ts`, and have safe examples in `.env.example`. Client variables are public at build time;
never put secrets there or commit local `.env` files.

Potential future additions, **not installed**, include `@react-three/rapier` for collisions,
`@react-three/postprocessing` for effects, `@react-three/gltfjsx` for asset conversion, and a browser test
runner for repeatable end-to-end input tests. Evaluate actual requirements before adding them.

## Verification and limitations

Node tests cover acceleration/deceleration, throttle and speed bounds, boost exhaustion/recharge,
quaternion steering and normalization, assistance, 20/30/60/144 FPS replay equivalence, catch-up limits,
input cleanup and pointer-lock failures, reset, camera separation, reduced-motion FOV, and HUD cadence.
They do not validate GPU behavior or replace playtesting. Input lifecycle tests use lightweight browser
adapter stubs rather than a real pointer-lock implementation.

- This is an arcade flight model, not an aerodynamic or orbital physics simulation.
- No combat, networking, AI, gravity, collisions, damage, landings, hyperspace, or audio exists yet.
  Rings and the planet are visual references and can be flown through.
- The reference corridor and local dust occupy a finite area. Free flight is unbounded; use Reset
  flight after leaving the scene. Floating origin, streaming, and large-coordinate precision remain
  future work. There is no touch or gamepad piloting yet.
- Pointer capture may be unavailable in embedded browsers or restricted contexts. Keyboard flight
  remains usable. Native pointer-lock success still needs manual verification in a supported browser
  if an automated browser rejects the request.
- Identical fixed-step input replays are tested locally; cross-platform determinism, server input
  validation, state serialization, prediction, and reconciliation are future networking work.
- The scene renders continuously while mounted, even when flight is paused. GPU/device performance
  needs broader measurement; approximately 60 FPS is a target, not a certified hardware guarantee.
- Vite reports its large-chunk advisory for the Three.js application/scene bundles. Unsupported WebGL
  browsers receive a fallback; automatic graphics-context recovery is not implemented.

Licensed under [MIT](LICENSE).
