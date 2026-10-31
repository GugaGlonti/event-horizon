# Event Horizon

A browser-based 3D flight and space simulator, built one system at a time.

**Phase 1: Foundation.** The starting experience is an orbital observatory: a softly lit, rotating
ringed world against a starfield. Drag to orbit, scroll or pinch to zoom, and use the overlay to pause
rotation, toggle stars, or restore the camera. Aster is a fictional artist's study, not a physical model.
No flight or gameplay systems are implemented yet.

## Stack

| Technology                           | Role                                        |
| ------------------------------------ | ------------------------------------------- |
| TypeScript 7, strict mode            | Application and tooling types               |
| React 19 + Vite 8                    | UI, development server, production bundling |
| Three.js 0.182 + React Three Fiber 9 | WebGL 2 scene and React renderer            |
| Drei 10                              | Orbit camera utilities                      |
| Zustand 5                            | Discrete scene and UI state                 |
| Tailwind CSS 4                       | UI utilities and styling integration        |
| Biome 2                              | Linting, import organization, formatting    |
| Vitest 5                             | Unit tests running in Node                  |

Exact resolved versions are recorded in `package-lock.json`. React and React Three Fiber must be
upgraded together; consult the [Fiber compatibility guide](https://r3f.docs.pmnd.rs/getting-started/introduction).
Three.js is intentionally pinned to r182: stable Fiber 9 still constructs `THREE.Clock`, which logs a
deprecation warning in r183 and later ([upstream issue](https://github.com/pmndrs/react-three-fiber/issues/3741)).
Reevaluate this pin when a stable Fiber release migrates to `Timer`; keep the Three.js types aligned.

## Get started

Prerequisites: **Node.js 22.12+ on the 22.x line, or Node.js 24+**, npm 10+, and a modern browser with
WebGL 2 and hardware acceleration. `.nvmrc` selects Node 22. Prefer a supported Node LTS release.

```bash
nvm use                    # optional, if using nvm
npm ci                     # install the committed dependency graph
npm run dev
```

Open the Local URL printed by Vite (normally `http://127.0.0.1:5173`). There are no required environment
variables, API keys, network services, models, fonts, or external texture downloads.

The scene supports mouse and touch orbiting, wheel/pinch zooming, and keyboard-accessible toolbar
buttons. Automatic rotation respects `prefers-reduced-motion` until the user explicitly presses Resume.
Resizing reframes the object, including on portrait screens. WebGL startup failures show a readable
fallback. The observation camera is the only camera in this phase.

## Commands

| Command              | Behavior                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Start Vite with hot module replacement                           |
| `npm run build`      | Type-check both TS projects, then produce `dist/`                |
| `npm run preview`    | Serve the built `dist/` locally; build first                     |
| `npm run lint`       | Check formatting, imports, and recommended Biome rules           |
| `npm run format`     | Apply formatting, import organization, and safe lint fixes       |
| `npm run typecheck`  | Check application, tests, and Vite config with strict TypeScript |
| `npm run test`       | Run all unit tests once; suitable for CI                         |
| `npm run test:watch` | Run tests interactively                                          |
| `npm run check`      | Run lint, tests, and a type-checked production build             |

CI runs `npm ci`, lint, tests, and the production build on pushes and pull requests. The preview server
is for local validation; production hosting can serve `dist/` as static files. Hosting is not configured.

## Project structure

```text
public/assets/                     Local static assets (currently the favicon)
src/
  app/                             App composition and renderer error boundary
  components/ui/                   Shared DOM UI: icons and scene messages
  engine/
    rendering/                     Canvas, renderer settings, initial camera configuration
    simulation/                    Pure, framework-independent animation math
  features/
    planets/components/            Reference celestial body and its visual rotation
    space/components/              Scene composition, orbit camera, scene toolbar
  hooks/                           Motion preference and effective rotation subscriptions
  stores/                          Zustand scene settings and camera reset requests
  styles/                          Tailwind theme, responsive variants, and global base defaults
  main.tsx                         React entry point
  vite-env.d.ts                    Client environment declarations
tests/                             Rotation behavior and scene-state unit tests
docs/architecture.md               Boundaries, performance guidance, extension points
AGENTS.md                          Repository instructions for AI-assisted development
```

Flight, spacecraft, input, hyperdrive, provider, and shared type directories should be added when they
have real responsibilities. Empty scaffolding and speculative abstractions are intentionally absent.

## Architecture

`App` composes the DOM overlay and lazily loads `SpaceScene`. `SceneCanvas` owns renderer policy and
the initial camera configuration. Feature components own visible scene objects and orbit input.
`engine/simulation/rotation.ts` contains pure angle integration and has no React or Three.js dependency.
See [the architecture notes](docs/architecture.md) for how future systems should connect.

Zustand stores low-frequency user choices. Components select individual fields rather than subscribing
to the entire store. Animated object transforms live in Three.js refs and change inside `useFrame`.
Never put per-frame position, velocity, or camera telemetry into React state.

The reference world uses declarative geometries and materials that Fiber disposes on unmount. Drei
owns its orbit controls; the local starfield also uses declarative geometry and material. Pixel ratio
is capped to limit GPU load on dense displays.
Rotation uses seconds rather than frame counts and caps large frame gaps. A fixed-timestep gameplay
loop, floating origin, LOD, atmosphere, shader pipeline, and post-processing are future work.

## Roadmap

### Phase 1 — Foundation

- [x] Project initialization and modular architecture
- [x] Interactive basic 3D scene
- [x] Development tooling, tests, CI, and contributor documentation

### Phase 2 — Flight

- [ ] Spacecraft controls
- [ ] Flight camera
- [ ] Movement physics with fixed-timestep simulation
- [ ] Cockpit HUD

### Phase 3 — Planetary Systems

- [ ] Procedural planets
- [ ] Atmospheres
- [ ] Space environments
- [ ] Planetary approach and departure

### Phase 4 — Hyperdrive

- [ ] Hyperdrive charging
- [ ] Warp visual effects
- [ ] Star system navigation
- [ ] Cinematic transitions

### Phase 5 — Polish

- [ ] Audio
- [ ] Visual effects
- [ ] Performance optimization
- [ ] Improved UI/UX

## Development conventions

- Inspect the existing modules and `AGENTS.md` before changing code. Extend established patterns.
- Use feature-local components and colocate types with their owners; extract only when reused.
- Use PascalCase for React components and camelCase for hooks, functions, and non-component modules.
- Use the `@/` alias for source imports and explicit `import type` for type-only dependencies.
- Prefer Tailwind utilities in components for UI styling, including responsive, focus, and motion
  variants. Keep `src/styles/index.css` for shared theme tokens, custom variants, and global defaults;
  use custom CSS only when it expresses an effect more clearly. Reuse components or static class
  strings instead of rebuilding utility styles as CSS component classes.
- Keep strict typing, two-space indentation, LF line endings, and a target line width of 100 characters.
- Favor small modules, composition, named exports, and pure simulation functions. The lazy-loaded
  scene has a default export for `React.lazy`.
- Add behavior tests for math, simulation, state transitions, or regressions; avoid snapshots of 3D
  implementation details. Unit tests do not validate GPU rendering.
- After a change, run the relevant checks and inspect visual changes in a browser.
- Keep this README, architecture notes, and AI instructions aligned with the actual implementation.

No environment file is required. If configuration is added, copy `.env.example` to `.env.local`, use
the `VITE_` prefix, and declare each variable in `src/vite-env.d.ts`. These values are public and embedded
at build time. Never put secrets in them or commit local `.env` files.

Install only dependencies needed by the current feature. Use npm and commit the matching lockfile.
Potential future additions, **not installed**, include `@react-three/rapier` for collision/rigid-body
physics, `@react-three/postprocessing` for effects, `@react-three/gltfjsx` as a model-conversion tool,
and a browser test runner when repeatable end-to-end coverage is needed. Evaluate each against actual
requirements before adding it.

## Known limitations

- This is a scene foundation, not a playable flight simulator. There is no spacecraft, physical orbit,
  collision, navigation, procedural planet system, audio, backend, persistence, or asset pipeline.
- The observation camera offers pointer/touch controls; a dedicated keyboard/gamepad flight input
  system and full nonvisual interaction with the 3D world are not implemented.
- Visual rotation is variable-step. The capped delta deliberately discards background-tab time;
  it is unsuitable as a gameplay clock or an authoritative simulation.
- The canvas renders continuously while mounted, including when rotation is paused. Low-power and
  demand-rendering modes should be measured and introduced when needed.
- Star positions are random per scene mount and remain stable when toggled. State is session-only
  and resets on page reload. Camera reset preserves the rotation and star settings.
- The 3D renderer is the largest initial scene download, though it loads separately from the UI shell.
  Vite reports its standard large-chunk advisory for this WebGL bundle. There is no WebGPU or non-WebGL
  visual equivalent; unsupported browsers receive a message.
- WebGL capability and GPU performance vary. Mobile devices and graphics-context loss need broader
  hardware testing before production release.

Licensed under [MIT](LICENSE).
