# Architecture and extension points

Milestone 2 connects browser input, a reusable flight simulation, interpolated rendering, and a sampled
HUD. Keep these responsibilities separate. Add systems for concrete requirements, not speculative use.

## Dependency direction and ownership

```text
App → FlightSession → input adapter + fixed-step loop + FlightController
App → SpaceScene → FlightWorld → ship model + environment + FlightCamera
App → FlightHud → sampled scalar telemetry + discrete UI settings
FlightController → Three.js math + explicit configuration/input types
```

Engine modules must not import app, features, stores, React, or renderer objects. Three.js `Vector3`,
`Quaternion`, and `MathUtils` are math dependencies, usable without a browser or WebGL. Shared DOM UI
must not import features or simulation. Cross-feature composition happens explicitly in the flight
world/scene. Avoid broad barrel exports and circular dependencies.

| Owner                                 | Responsibility                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `app/App`                             | Session lifetime, focusable input target, lazy renderer, overlay composition |
| `app/SceneErrorBoundary`              | Renderer fallback and input pause on renderer errors                         |
| `engine/input/FlightInputManager`     | Keyboard/pointer-lock adapter and active listener lifetime                   |
| `engine/simulation/FlightController`  | Private authoritative pose/velocity, throttle, angular rates, boost          |
| `engine/simulation/FixedStepLoop`     | Explicit fixed ticks, bounded catch-up, interpolation fraction               |
| `features/flight/config`              | Physics, timing, input, camera, and environment parameters                   |
| `features/flight/FlightSession`       | One-player orchestration, copied/interpolated pose, 10 Hz HUD publication    |
| `features/flight/camera/FlightCamera` | Camera presentation; never mutates simulation                                |
| `features/flight/components`          | HUD, controls/pause menu, cockpit framing, frame orchestration               |
| `features/spacecraft`                 | Replaceable procedural model and engine exhaust                              |
| `features/space` / `features/planets` | Static spatial references, sky, dust, reference planet                       |
| `stores/flightStore`                  | Discrete session/UI choices and scalar HUD snapshots                         |

## Units and simulation

Use metres, seconds, radians; right-handed coordinates with local forward -Z, up +Y, right +X.
Positive input pitch raises the nose, yaw turns right, and roll banks right. Angular rates are local
body rates. Normalize quaternion multiplication after integrating the combined axis-angle increment;
do not use Euler angle integration for ship motion. Telemetry heading/pitch use the forward vector,
not Euler orientation state.

The controller accepts `FlightConfig`, `FlightInput`, and explicit dt. It has no wall-clock, random,
React, DOM, global-store, camera, or renderer access. Internal pose/velocity objects stay private.
`copyTransform` writes into caller-owned scratch objects, and `getTelemetry` returns detached read-only
scalar snapshots. The latter intentionally allocates only at the HUD publication cadence.

Throttle is a rate command (-1/0/+1), bounded to [0,1], and holds when released. Forward thrust seeks
a throttle-dependent target speed within acceleration limits. Assistance damps lateral velocity and
angular rates; without assistance, drift and rotation persist. Brake overrides thrust and boost but
preserves throttle. Boost drains a finite reserve, waits before recharge, and requires key release
and sufficient reserve after exhaustion. Boost exit progressively reduces the speed envelope to
cruise. No collisions, gravity, networking, or aerodynamic lift are simulated.

## Timing and interpolation

`FlightSession` samples browser intent once per render, then drives `FixedStepLoop` with a stable step
callback. The loop advances 1/120-second ticks, limits any frame to 0.1 seconds and 12 ticks, and
discards excess backlog. Previous/current copies bracket the latest completed tick. Position lerp and
quaternion slerp produce the render pose without changing the simulation.

Pause clears the accumulator; resume does not integrate time spent paused. Reset clears controller
state, both interpolation endpoints, the telemetry timer, and render pose. A revision tells the camera
to snap home rather than interpolate from a distant old location. Camera/assistance UI preferences
survive reset.

Use refs for object transforms and reuse scratch vectors/quaternions in frame callbacks. Do not put
per-frame position, orientation, camera state, or raw simulation ticks in React/Zustand. HUD snapshots
publish at 10 Hz; settings change only in response to discrete actions. The remaining pure rotation
helper is for visual planet animation, not flight timing.

## Browser input lifecycle

The app effect attaches one input manager and returns its disposer. Paused sessions keep only lifecycle
listeners; keyboard, mouse, wheel, and context-menu handlers exist only while piloting. Keyboard-only
launch is explicit, and arrows work in both modes. Up arrow pitches the nose down; Down arrow pitches
the nose up. C/F actions ignore key repeat.

Mouse capture is requested only by a user gesture. Relative movement drives a bounded steering input
that gently recenters. Pointer-lock failure leaves the briefing visible with a keyboard alternative.
Escape, lock release, blur, document visibility loss, renderer error, and unmount clear held input and
stop simulation. Resume is explicit. Late capture grants must not revive a disposed or paused owner.
These setup/cleanup paths must survive React Strict Mode.

## Camera and resources

The chase camera exponentially damps position and quaternion rotation and adjusts FOV with speed.
Cockpit view copies the interpolated ship transform with a local eye offset; the outside model is
hidden and a lightweight cockpit frame follows the camera. Camera changes never write to physics.
Reduced motion keeps FOV fixed and suppresses automatic planet rotation; no camera shake is added.

Fiber owns declarative geometries/materials for the ship, cockpit, sky, dust, gates, and planet. The
procedural model knows nothing about the controller and uses -Z forward so it can be replaced with a
GLTF asset. Exhaust length is updated through a ref. The sky follows the player's render position to
act as distant background; dust and navigation rings remain stationary for translational parallax.
No textures, external models, post-processing, or per-frame geometry allocations are required.

Keep device pixel ratio bounded. Future manual textures, render targets, and shared caches need clear
ownership and exactly-once disposal. Do not add terrain, LOD, atmospheric shaders, or floating-origin
machinery without a measured feature requirement.

## Tests and future networking

Node tests exercise controller behavior, speed/throttle bounds, boost lifecycle, all rotation axes,
normalization through combined turns, assistance, fixed-step replay across render rates, suspension
bounds, pause/reset, input cleanup/failure/disposal, camera independence, FOV preferences, and HUD
cadence. Browser adapter stubs verify lifecycle logic but cannot prove native pointer capture.

`npm run check` runs lint, tests, strict typing, and a production build. Browser QA must verify launch,
mouse capture or its fallback, throttle, steering, boost/brake, C/F, Escape, reset, narrow layouts,
keyboard focus, and console health. Do not infer GPU correctness or a guaranteed FPS from unit tests.

The engine controller and clock can later run on a server with the same config and tick/input
sequence. That boundary is preparation, not a networking implementation or a guarantee of bitwise
cross-platform determinism. Add input validation, explicit state serialization, authority, prediction,
and reconciliation in a dedicated networking milestone. Keep render interpolation separate from any
future network interpolation. Define world/render coordinates before introducing a floating origin.
