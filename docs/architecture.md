# Architecture and extension guide

Milestone 3 extends the existing flight session. Physics, world definitions, navigation, jump timing,
GPU presentation, and React overlays remain distinct. No combat, networking, or server infrastructure
is implemented.

## Dependencies and ownership

```text
App → FlightSession → FlightInputManager + FixedStepLoop + FlightController + HyperspaceFlight
                   → ExplorationSession → SystemRuntime + NavigationComputer + HyperspaceController
App → FlightHud + ExplorationOverlay → detached store read models / session actions
SpaceScene → FlightWorld → SystemScene + ship + FlightCamera + HyperspaceTunnel
SystemScene → shared celestial geometry + CelestialBody + sky + local references
```

Engine modules import only engine contracts and Three.js math. They cannot import React, DOM, stores,
features, renderer objects or clocks. `worldTypes.ts` contains serializable tuples/metadata, not Three
objects. Feature orchestration composes engine services and supplies browser adapters/loaders.

| Owner                           | Responsibility                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `engine/simulation`             | Private flight state, quaternion integration, explicit fixed ticks                     |
| `engine/world`                  | Definition contracts/validation, analytical hierarchy, safe arrival, render conversion |
| `engine/navigation`             | Target validity, logical distances/ship-relative bearings, pure jump state machine     |
| `features/exploration/data`     | Handcrafted catalogue, explicitly cancellable preparation boundary                     |
| `ExplorationSession`            | One journey, preparation token/abort, active runtime, commit, audio lifetime           |
| `FlightSession`                 | Input lifetime, interpolated logical pose, render origin/pose, arrival/flight handoff  |
| `FlightCamera`                  | Presentation-only follow, rebase compensation, FOV and optional vibration              |
| `SystemScene` / `CelestialBody` | Shared geometry, per-body shader uniforms, world-to-render transforms                  |
| `HyperspaceTunnel`              | Depth-tested corridor mask; the shared Starfield owns point-to-trail morphs            |
| `stores`                        | Discrete state and detached scalar/tuple snapshots; never authoritative transforms     |

## Flight and timing

Metres, seconds and radians; local forward -Z, up +Y, right +X. Positive input pitch raises the nose,
yaw turns right, roll banks right. Combined body rates integrate a normalized quaternion. Keyboard
Up/Down are inverted pitch, Left/Right roll, and Q/E yaw; mouse motion remains pitch/yaw.

`FlightController.step(input, dt)` owns logical position, velocity, orientation, throttle, boost and
assistance. It does not read clocks, stores or input devices. `copyTransform` copies into scratch
objects; scalar telemetry is detached. `relocate` validates a finite pose and optional bounded forward
speed, setting matching throttle while preserving reserve, assistance and trip distance. Its default
stops momentum; jump completion uses 100 m/s. Full reset restores reserve separately.

`FlightSession` runs physics at 120 Hz, caps catch-up to 0.1 seconds/12 ticks, and discards suspension
backlog. Previous/current endpoints interpolate the presented logical pose. Reset replaces both
endpoints and increments a revision so the camera snaps. Jump handoffs replace the endpoints while
preserving the camera revision and relative follow pose. Pause clears the accumulator. Navigation
and flight telemetry publish at 10 Hz; discrete changes publish immediately. Paused idle navigation
has no recurring store publications.

Celestial time advances only during active flight or an unsuspended jump. Each frame contributes at
most 0.1 seconds. Positions are analytical functions of this explicit session time, not accumulated
Euler transforms or random frame deltas. Visual axial spin uses the same time. Paused maps therefore
hold orbits still. Reduced motion suppresses visual axial spin, not essential logical moon positions.

## Logical coordinates and render origin

Each system has its own logical coordinate frame. Positions and radii are compressed metres suitable
for travel at 180 m/s cruise and 360 m/s boost. Definitions use parent-relative tuples or circular
orbital parameters. `SystemRuntime` validates/sorts parents once and reuses CPU `Vector3` positions.
A moon inherits its parent's translated position, without inheriting the parent's axial spin.

`RenderOrigin` rounds the interpolated ship position to a 1024-metre grid. Ship and celestial render
positions subtract that origin. Physics, navigation distances, spawn selection, and system IDs do not
change when rendering rebases. `FlightCamera` first translates its existing position by the origin
delta, then follows the new local target, preventing a damping lurch at grid boundaries.

Bodies farther than 60 km from the origin are hidden and their render transform is zeroed. Reference
beacons receive the same treatment. Sky/tunnel effects follow the nearby camera, and dust wraps
through a 4 km periodic field only when the origin changes. No enormous logical positions enter GPU
transforms. Stable system IDs plus logical positions are suitable future synchronization keys; no
protocol or cross-platform determinism guarantee is implied.

## Definition preparation and safe arrivals

`StarSystemDefinition` is a JSON-compatible object with stable ID, name/description, chart position,
shared three-dimensional galactic position,
environment, celestial bodies, spawn points, default target and arrival ID. Body IDs are unique within
the system. Definitions support one star, rocky/gas planets and moons, parent links, positions or
orbits, radius, axial spin/tilt, palette/pattern, atmosphere and rings. Rotation/orbit angles are radians;
periods are seconds. Ring radii are multiples of body radius.

Validation rejects duplicate IDs, missing/cyclic parents, invalid star/moon hierarchy, non-finite
positions, invalid periods/radii, malformed palettes/effects, unknown targets/arrivals and unsafe or
non-unit spawn configurations. Runtime arrival selection adds the spawn offset to its anchor's
current logical position. It checks every body's radius plus a 100 m margin; an obstructing moving
moon moves the arrival above the local system's highest safety zone.

Current definitions are bundled and need no network assets. `loadSystem(id, signal)` is an asynchronous
preparation seam: future assets may be loaded there without coupling the state machine to promises.
Preparation validates and constructs a CPU runtime before activation. Unmount/abort/reset invalidate
an operation generation and abort its signal; late success/failure cannot affect another journey.

## Hyperdrive transaction

`HyperspaceController` owns explicit IDLE → CHARGING → ACCELERATING → HYPERSPACE → EXITING → COOLDOWN
→ IDLE transitions. Exported timing is configurable. Its only inputs are a validated destination,
preparation readiness and bounded dt. It never changes a world, ship, camera, audio node or store.

`ExplorationSession.beginJump` derives a shared travel axis from the source/destination galactic
positions, checks the swept departure lane, clears/restricts input, starts preparation and optional
Web Audio. `HyperspaceFlight` samples an analytical quaternion alignment/bank, quadratic departure surge,
and decelerating arrival coast. Its distance derivative matches the 100 m/s physics handoff. Paused
normal physics never integrates hyperspeed. Abort adopts the currently displayed pose with zero speed.

The 1.3-second entry gives stars a readable buildup: full extension by 48%, ignition at 55%, and tunnel
reveal after 72%. The 5.2 km departure and camera/audio impact share the ignition threshold, keeping the
actual launch under 0.6 seconds. A small continuous star sweep prevents a frozen long-streak hold;
most virtual travel occurs at ignition. Each star supplies its own outward exposure trail, with varied
depths/widths, a white core, cyan shoulders and a soft blue halo. No particles recycle or morph to
another layout. The stars fade through one exposure crest into layered cloud walls. Exit contracts the
same field back into points. `hyperspaceVisuals` owns continuous stretch/travel/exposure envelopes and
damped camera recoil/rattle. Reduced motion suppresses these effects.

A prepared destination cannot commit until HYPERSPACE has run for its minimum duration. Before commit,
`routeArrival` rechecks a source-facing corridor against surfaces, atmosphere, rings and six seconds of
possible moon displacement. On entry to EXITING the runtime swaps atomically. `FlightSession` changes
the logical frame while the camera compensates both origin and ship translation, preserving relative
position, orientation and FOV. A reset still explicitly snaps the camera.

EXITING stays at zero progress with full coverage until the matching destination SystemScene reports
its first frame. Stale source frames cannot unlock it. Both CPU preparation and renderer readiness have
bounded 12-second deadlines. The first 14% of exit remains opaque; coverage falls over 14–23% (about
0.1 seconds), coordinated with star contraction, a restrained exposure crest and the exit impulse.
The arrival speed falls from 3200 to 100 m/s with a seventh-power velocity curve; its analytical
distance integral exactly matches the final pose and handoff velocity. Gameplay motion values live
in flight/config.ts and the full swept corridor uses those same bounds. All assets are procedural
geometry/shaders. The old keyed SystemScene releases its owned resources.

On cooldown entry, normal keyboard flight returns; pointer-lock recapture needs another user gesture.
Camera mode, assistance and engine reserve survive. The arrival notice lasts three seconds. Charge is
a small HUD readout; transit has no central overlay or phase percentages. A held journey shows explicit
resume/abort controls. Layered motor harmonics, filtered mechanical chatter and seeded stereo noise
feed a compressor. Ignition/exit add bass sweeps, filtered air bursts and short latch tones, once each.
Exit audio waits for reveal progress, including while renderer readiness holds the scene opaque.
Suspension mutes the master; abort/teardown stop and disconnect every voice and release buffers.

Failure before commit keeps the source runtime and current cinematic pose. HYPERSPACE readiness has a 12-second deadline.
Cancel before commit retains the source; cancel after commit holds at the destination. Both paths
release restrictions and require an explicit flight resume. Blur/visibility loss holds an active
journey; **Resume journey** continues it. Bounded dt prevents hidden-tab catch-up. Renderer failure
cancels travel and disables launch/map actions. Reset cancels first, then respawns in the current
system. No queued callback may revive a disposed session.

## Input, overlays and accessibility

`FlightInputManager` installs movement, wheel and context-menu listeners only while piloting, cleans
held state on pause, and rejects late pointer capture after pause/disposal. Keyboard fallback is
preserved. `FlightSession.attach` owns a separate discrete navigation shortcut listener so M/L can
also close paused maps. Repeated keys, modifiers and text-editing targets are ignored. T/X cycle/clear
a target only outside maps and jumps. Escape closes a map or aborts travel. Active jumps block map
opening and normal flight capture.

Maps pause before opening, release pointer lock and contain keyboard focus. Backdrop/panel stacking
prevents input reaching the world. Closing a map restores focus and the briefing; it does not silently
resume. Local-map **Resume keyboard flight** is an explicit action. Selected destinations/targets use
pressed states; current-system, missing-selection, unready and cooldown jumps are disabled with a
visible reason. Target HUD distances are surface distances; the marker is a ship-relative bearing,
not an exact camera-space lock-on reticle.

## Rendering and resource lifetime

One reusable celestial shader supports ocean/cloud, desert, ice, volcanic, banded and cratered
patterns. Normals and a CPU-updated star direction provide day/night light. Atmospheres use a Fresnel
limb; stars use emissive surface/corona. Rings combine fine radial bands, transparency and an analytic
planet shadow. Per-system ambient light and seeded nebula backgrounds vary the mood.

Each mounted SystemScene owns one shared SphereGeometry, attached to bodies/atmospheres as external
primitives and explicitly disposed on scene teardown. Fiber owns declarative per-body materials,
rings, sky, ship, cockpit, dust, beacons and tunnel buffers. There are no render targets, external
textures, models or post-processing dependencies. Sky and hyperdrive components reuse geometry and
uniform references between frames. One persistent 12,000-star galactic catalogue supplies point and
trail billboards across all systems. Its 48,000 vertices fit 16-bit indices. The normal sky already
contains every star used by the jump, and the same angular pattern survives the world handoff. Buffers
depend only on sky radius, never system seed or frame time. Stars occupy 35–100% of that virtual radius.
Projecting each star's finite forward exposure produces depth-dependent length and outward speed;
bounded proximity controls width. Virtual depths affect motion only: normal stars render behind the
celestial bodies. Trail widths use CSS viewport pixels. There is no separate corridor particle layout,
time loop or accumulating star simulation.

The tunnel samples two scales of 3D value noise on three bounded depth shells. A bent centerline,
irregular wisps and dark cloud channels create forward flow without angular rotation or an atan seam.
This is a layered analytic effect, with no volume raymarch or extra star streaks. Two camera-relative
point lights move blue highlights across foreground surfaces; ambient light fills the shadows.
The original Kestrel canopy has ribs, instrument housings and faint procedural glass highlights.
It follows the craft's nominal cockpit pose while the camera impulse moves relative to it.

The transparent depth-tested tunnel mask draws after celestial transparency (order 10), preserving
nearby opaque ship/cockpit depth. Star trails draw next (20), with bounded virtual depth during transit;
glass highlights follow (25) and exhaust draws last (30). Fiber owns every declarative geometry,
material and light. These are ordered scene draws, with no render targets or post-processing.

Fiber 9 copies shader uniform wrappers when applying props. Update per-frame scalar uniforms through
the mounted ShaderMaterial ref; mutating the original props object's number does not update the GPU.
Vector uniform values are stable reused objects. Reuse scratch vectors/quaternions; never create
geometry or publish React state per frame. The flight frame callback has priority -2 so simulation,
origin and camera update before world/effect presentation. No positive-priority callback takes over
rendering.

Reduced motion disables dynamic FOV, recoil/rattle, tunnel animation, star trails, exposure flashes,
moving light/glass highlights, alignment bank and axial spin. The tunnel still
masks a transition and progress remains legible. Device pixel ratio stays bounded. LOD/adaptive quality
and broader hardware profiling are future improvements, not a promise of universal 60 FPS.

## Adding a system, planet or moon

1. Add a JSON-compatible `StarSystemDefinition` to `features/exploration/data/systems.ts` with a new
   stable system ID, chart position, distinct galactic position and environment palette. Galactic axes
   share local +Y up and -Z chart north; do not infer routes from decorative chart coordinates. The catalogue validation runs on import.
2. Give its central star a fixed position and unique body ID. Add three or more worlds as desired,
   with star-relative positions, radius, surface pattern/palette and rotation. Reuse the existing
   `star`/`planet` data helpers or write the typed objects directly.
3. Add moons with a planet parent ID, radius and orbit (radius, period, phase, inclination). The orbit
   must clear the parent plus moon radius. Parent array order does not matter; do not rename stable
   IDs casually if saves or multiplayer are introduced later.
4. Add an arrival spawn anchored to a body, an offset outside the body +100 m safety margin, and a
   normalized quaternion. Use [0,0,0,1] to face -Z. Check the visible ring extent and other moons too.
   Assign arrivalId and defaultTargetId. Add optional atmospheres/rings using the same renderer.
5. Extend validation/orbit/arrival tests with the new data. Run `npm run check`, inspect the local
   chart, fly near its primary world, then jump in/out in both camera modes and a narrow viewport.

Adding a surface pattern requires a typed pattern, validation entry and one shared shader branch;
never fork the entire system renderer for a single world. Future planetary LOD/terrain should remain
presentation data layered over the same logical hierarchy and coordinate contract.

## Verification and future work

Pure tests cover validation, hierarchy/order, analytical orbits, coordinate conversions/rebases,
target/distance/bearing logic, safe arrivals, every jump phase, cancellation and load recovery. Browser
adapter tests cover maps, stale held keys, visibility, disposal, reset and flight restoration. Camera
and physics tests retain the Milestone 2 replay, boost and steering coverage, with bounded camera
impulse/settling and reduced-motion suppression. Audio adapter tests check one-shot cue timing,
gating the exit cue while arrival is held, suspension muting, restart and complete node/context teardown.

`npm run check` runs lint, all tests and a strict production build. Browser QA must cover the entire
Solara → Vesper → Aether → Solara route, orbital contact selection, maps, jump masking, phase/status
feedback, camera modes, abort/recovery, small layouts, focus and console health. Tests cannot certify
native pointer capture, GPU performance or audio perception on every device.

Next is Space Combat & PvE: introduce weapons, damage and explicit combat targeting without mixing
navigation or camera state into physics. Authoritative multiplayer PvP follows as a separate milestone,
with input validation, serialization, prediction and reconciliation built around stable system IDs and
logical poses. No speculative server implementation is included here.
