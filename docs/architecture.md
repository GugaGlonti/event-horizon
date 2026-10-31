# Architecture and extension points

The foundation is deliberately small. Add a module when it has behavior, not merely because a future
system might need it. `App` is a composition root, not a gameplay controller.

## Dependency direction

```text
app → features → engine
      features → shared UI, hooks, stores
      hooks → stores
      stores → Zustand
      pure simulation → standard language features only
```

`engine/rendering/SceneCanvas` also uses the shared `SceneMessage` fallback. Shared UI must not import
features, app, engine, or stores. Engine modules must not depend on feature modules or the app.
Import a concrete module instead of using large barrel files. Avoid feature-to-feature imports except
at explicit composition points (currently `SpaceScene` composes `CelestialBody`).

## Responsibilities today

| Owner                          | Responsibility                                               |
| ------------------------------ | ------------------------------------------------------------ |
| `app/App`                      | DOM overlay, app composition, lazy scene boundary            |
| `app/SceneErrorBoundary`       | Readable fallback for renderer startup/runtime errors        |
| `engine/rendering/SceneCanvas` | Canvas, camera defaults, pixel ratio, WebGL settings         |
| `engine/simulation/rotation`   | Pure angle integration with a bounded visual delta           |
| `features/planets`             | Reference world mesh, rings, mesh ref, visual frame callback |
| `features/space`               | Lighting, stars, observation camera input, scene settings UI |
| `stores/sceneStore`            | Discrete user choices and monotonic camera reset request     |
| `hooks`                        | External motion preference and effective rotation policy     |

The camera is remounted for a reset, so Drei clears its damping state and disposes the old controls.
Its effect also reframes on aspect-ratio changes. Canvas/Fiber manages resize observation and the
projection matrix. A renderer error boundary catches failures, while Canvas supplies its unsupported
WebGL fallback. Neither is a complete graphics-context recovery system.

## Animation and state

Visual rotation runs in `useFrame`, writes to a mesh ref, and integrates radians per second using the
frame delta. No React state is changed inside the frame loop. A capped delta avoids sudden jumps
after returning from a background tab. Pause affects rotation; the camera and toolbar stay interactive.

Zustand is for infrequent state changes, not a transport for every simulation tick. Use selectors for
individual state fields and stable actions. Settings are not persisted. `rotationEnabled: null` follows
the system's motion preference; an explicit Play/Pause choice overrides that default for the session.

## Future flight integration

When Phase 2 begins, introduce only the pieces needed for a small flyable spacecraft:

1. An `engine/input` module collects keyboard/gamepad input into an intent snapshot. Keep DOM listeners
   out of simulation functions and clean them up when the owning component unmounts or loses focus.
2. Pure `engine/simulation` functions advance position, orientation, and velocity using an explicit
   fixed `dt`. Start with one consistent coordinate system and document units.
3. A bounded accumulator in an engine loop advances fixed ticks, limits catch-up work, and exposes
   interpolation data. Do not reuse the visual helper as that clock.
4. A flight feature connects intent to simulation. Spacecraft render components consume interpolated
   transforms through refs. A separate camera controller follows the rendered craft.
5. Publish HUD snapshots at a measured, limited rate, keeping simulation updates independent of React
   renders and display refresh rate.

None of these systems is implemented yet. Do not introduce a generic entity framework, service
container, inheritance hierarchy, or physics engine before a concrete flight requirement exists.

## Graphics and resource lifetime

- Declarative Fiber geometries/materials are automatically disposed on unmount. Keep ownership clear.
- When adding manually allocated textures, render targets, custom geometries, or materials, make the
  owner dispose them exactly once; shared cached assets need a shared lifetime policy.
- Effect setup and cleanup must survive React Strict Mode. Do not dispose a shared resource while
  another component still uses it. Drei owns the lifecycle of its orbit controls.
- Avoid allocations, new vectors/materials, and React state updates inside `useFrame`. Reuse refs and
  scratch objects. Subscribe to only the state a component needs.
- Cap device pixel ratio. Add shadows, higher geometry density, and post-processing only with a
  measured frame budget. Do not silence bundle warnings in place of understanding their cause.
- Before astronomical distances, define world-space and render-space boundaries so a future floating
  origin can transform render coordinates without changing authoritative simulation coordinates.
- Procedural planets, LOD, streaming, custom shaders, atmosphere, and post-processing should be
  separate, measured additions. The current faceted mesh and simple ring bands are a scene study.

## Validation

`tests/rotation.test.ts` exercises frame-rate independence, wrapping in either direction, and long
frame gaps. `tests/sceneStore.test.ts` exercises motion overrides, star toggles, and independent reset
requests. These tests require neither a browser nor WebGL.

Use `npm run check` for lint, unit tests, strict typing, and a production build. Browser validation is
still required for visual or input changes: load the scene, orbit, zoom, reset, toggle settings, resize
to portrait, check reduced motion, and inspect the console. Do not infer GPU correctness from a build.
