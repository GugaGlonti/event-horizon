# Architecture and extension guide

Milestone 4 extends the existing flight session with shared combat simulation. Flight, collision,
damage, AI, world definitions, navigation, jump timing, GPU presentation and React overlays remain
distinct. No networking or server infrastructure is implemented.

## Dependencies and ownership

```text
App → FlightSession → FlightInputManager + FixedStepLoop + FlightController + HyperspaceFlight
                   → CombatSession → CombatSimulation → shared FlightControllers + SphereSolver
                   → ExplorationSession → SystemRuntime + NavigationComputer + HyperspaceController
App → FlightHud + ExplorationOverlay → detached store read models / session actions
SpaceScene → FlightWorld → SystemScene + ship + FlightCamera + CombatScene + HyperspaceTunnel
SystemScene → shared celestial geometry + CelestialBody + sky + local references
```

Engine modules import only engine contracts and Three.js math. They cannot import React, DOM, stores,
features, renderer objects or clocks. `worldTypes.ts` contains serializable tuples/metadata, not Three
objects. Feature orchestration composes engine services and supplies browser adapters/loaders.

| Owner                           | Responsibility                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `engine/simulation`             | Private flight state, quaternion integration, explicit fixed ticks                     |
| `engine/physics`                | Continuous sphere contacts, logical doubles, bounded mass-weighted impulse solve       |
| `engine/combat`                 | Entity lifetime, shared commands, health, weapons, target leading and AI               |
| `CombatSession`                 | System collider adapter, encounter spawning, read models and optional combat audio     |
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
Holding W gradually raises stored throttle from 0 to 100%. Releasing W gradually returns throttle to
zero and slows the full velocity vector at normal deceleration. S lowers throttle and applies stronger
braking, taking priority over thrust/boost. Both slow the ship with or without assistance. Boost needs
W held. Braking caps stored throttle at the remaining forward cruise speed. A/D and R/V command
local lateral/vertical velocity; Z commands bounded reverse thrust when main throttle is released.
Translation jets use configurable acceleration/speed and braking takes priority over every axis.
Space is primary fire, B begins a patrol, and N cycles hostile contacts independently of T/X navigation.

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

Celestial time advances only during active flight or an unsuspended jump. FlightSession advances
`ExplorationSession.advanceWorld` once per fixed gameplay tick before preparing moving celestial
colliders. Standalone exploration and cinematic jumps retain bounded explicit frame deltas. Each
frame contributes at most 0.1 seconds. Positions are analytical functions of this explicit session time, not accumulated
Euler transforms or random frame deltas. Visual axial spin uses the same time. Paused maps therefore
hold orbits still. Reduced motion suppresses visual axial spin, not essential logical moon positions.

## Combat simulation and collisions

`FlightSession` is the existing session composition point. It owns `CombatSession`, passing its
player `FlightController` into `CombatSimulation`; there is no duplicate player transform or second
movement integrator. `CombatShip` holds a stable ID, team, controller, health, cooldown and previous/
current endpoints. `ShipCommand` contains a flight snapshot, fire flag and optional selected weapon slot. Browser input and
`ShipAi` produce the same command shape. AI cannot set orientation or teleport; it consumes the same
acceleration, damping and turn-rate limits. Configurations live in `features/combat/config.ts` and are
passed into the engine, including mass/radius, handling, shield/hull, gun/missile/railgun/flak statistics and AI ranges.

The fixed tick advances analytical celestial positions, prepares environment velocities, integrates
ship orientation/velocity with the shared controller, resolves swept movement, sweeps existing shots,
and emits new shots at end-of-tick muzzles. Collision-adjusted position/velocity return through
`FlightController.resolveMotion`, preserving orientation, throttle, boost and trip state. Live player
assistance settings do not change NPC assistance. Health/regeneration/cooldowns and all entity
lifetimes use fixed simulation time. Presentation interpolates ship and projectile endpoints.

Ship and asteroid shapes are conservative spheres. Stars, planets and moons use their surface radii;
atmospheres, rings and beacons are non-solid. `sweepSphere` solves relative segment/sphere time of
impact, including initial overlap, using a stable quadratic root. `SphereSolver` advances bodies
together to the earliest impact, separates overlap, applies a mass-weighted impulse with 0.15
restitution and retains tangential velocity. Environment bodies have infinite mass; moon velocity
comes from consecutive analytical orbit positions. Up to 24 contacts are processed per tick; a crowded
pileup freezes remaining travel instead of tunneling. True celestial positions are restored from the
analytical runtime after solving. All collision math uses logical doubles and never the render origin.
Impact damage is bounded, energy-scaled arcade tuning with a 12 m/s harmless-contact threshold.

Rapier was evaluated against its official [CCD documentation](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/)
and [determinism contract](https://rapier.rs/docs/user_guides/javascript/determinism/). It offers richer
rigid-body contacts and deterministic WASM simulation. This foundation only needs spheres and arcade
flight already integrated in logical double precision. A second body world would require a local
physics origin, kinematic/velocity handoff and lifetime synchronization. The focused analytical
solver keeps one movement authority and adds no dependency. Reconsider Rapier when contact torque,
complex rigid shapes, debris or larger scenes are actual requirements. This solver guarantees neither
cross-platform bitwise replay nor general-purpose rigid-body dynamics.

The default gun uses inherited ship velocity, cooldown, alternating muzzles, bounded lifetime and
relative-motion sweeps against moving ships/environment. Missiles capture the selected hostile
within a configured forward cone/range at launch, inherit launch velocity, and use bounded
quaternion turns toward a constant-velocity intercept. Their target ID remains fixed when selection
changes; target loss leaves ballistic flight. They use the same nearest-hit sweep and lifetime path.
The railgun accumulates charge in fixed simulation ticks while fire is held and the shared reload
has elapsed. Release, slot changes, pause, departure and destruction clear partial charge. At 0.8 s
it traces a straight ray from local `[0, 0, -6]` against current collider positions; the first solid
contact truncates damage and the recorded endpoint. Its 0.25-second tracer does not reapply damage.

Flak emits a complete 12-pellet salvo from the same central muzzle, with deterministic disk coverage
inside a configured cone. One central pellet and a golden-angle disk pattern give stable coverage
without global randomness. Each pellet inherits ship velocity and follows the shared projectile
sweep, lifetime and damage rules. Salvos reserve their entire capacity before firing; a full buffer
does not emit a partial burst or consume reload. Short lifetime limits useful range.

A shared nearest-hit query handles swept projectiles and instantaneous rays. Collision layers and
owner/team filters disable self/friendly fire, while the environment blocks every weapon. Damage
still depletes shield, then hull; only shields regenerate after the configured quiet interval. Gun
assist and flak's lead cue use the selected contact's intercept; missiles show acquisition status,
and the railgun's aim marker uses the target's current position. Number-row/numpad 1–4 are active-flight input callbacks;
selection is published immediately, retained through pause/jumps and reset on respawn. Slot commands
also flow through `ShipCommand` for simulation replay. All slots share the ship cooldown, preventing
switching from resetting reload.

Rail traces record owner, logical start/end, age and lifetime and are capped at 32. Presentation
anchors the source to the interpolated central emitter and the endpoint to the recorded strike.
`RailgunEffects` uses fixed instance buffers for a straight bright core and blue halo, with thickness
bounded near the cockpit and scaled for distant visibility. A ref-driven central coil presents the
simulation charge; reduced motion disables its rotation. `WeaponEffects` reuses bounded missile-body
and amber exhaust-flare instances; `CombatScene` shares its bolt buffer with flak pellets. There are
no emitted weapon-trail particles or per-frame geometry creation. Gun, missile, railgun, flak and detonation
cues use the existing bounded optional audio adapter.

`CombatSimulation` centrally owns spawning, destruction, target validity, projectiles and effects.
NPCs are removed on destruction; player death is retained until explicit respawn. Limits are ten
NPCs, 192 projectiles, 32 rail traces, 96 transient effects and eight encounter asteroids. Effect IDs and entity IDs
are monotonic within the session. Target cycling follows stable insertion order and is range-limited.
The encounter adapter searches deterministic clear spawn positions near the current ship and checks
celestial bodies, asteroids and ships. B cannot stack waves. Practice uses the same ship/health/hit
path with stationary AI. Victory enables another encounter. Reset/respawn clears it and restores the
player at the current system's safe arrival with three seconds of protection.

`ShipAi` uses explicit patrol, pursue, attack, evade and disengage states. Detection, home leash,
attack alignment, separation, hit evasion and duration are configured. It calculates an intercept,
steers in its local quaternion frame, avoids imminent spherical obstacles and fires only in the
attack state while aligned. It is lightweight steering, not pathfinding or strategic planning.

Maps/focus loss/pause stop the shared clock and clear fire as well as flight input. Hyperdrive
departure clears the encounter and suspends normal collision/combat simulation. Arrival or abort
rebuilds celestial colliders at the matching runtime's current time; existing masked handoff rules
are unchanged. Player damage persists across jumps. Teardown clears entities and closes audio;
reattachment rebuilds colliders for React Strict Mode.

`combatStore` contains only 10 Hz detached readouts, discrete sound preference and HUD projections.
`CombatScene` updates reused refs and fixed-capacity instance buffers for asteroids, lasers and effects;
Fiber owns their geometry/material lifetime. Ten reusable enemy model slots hide unused/far transforms.
Combat projections follow the readout cadence after camera update. Death shows a keyboard-focusable
respawn action. Camera impact offsets are bounded, decay with simulation time and respect reduced
motion. `CombatAudio` uses gesture-started synthesis, consumes each effect ID once, caps voices at 12,
and stops/disconnects nodes on pause/mute/departure/disposal; audio never gates simulation.

Future authority can validate commands and replay fixed ticks against stable system/entity IDs and
shared configurations. A server implementation still needs serialization, input validation, explicit
spawn/action events, synchronization, reconciliation, lag compensation and authoritative random/
orbital policy. None of those are represented as implemented networking here.

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
in flight/config.ts and the full swept corridor uses those same bounds. Celestial assets use
procedural geometry/shaders. The shared spacecraft GLB library stays mounted
across handoffs. The old keyed SystemScene releases its owned resources.

On cooldown entry, normal keyboard flight returns; pointer-lock recapture needs another user gesture.
Camera mode, assistance and engine reserve survive. The arrival notice lasts three seconds. Charge is
a small HUD readout; transit has no central overlay or phase percentages. A held journey shows explicit
resume/abort controls. `HyperdriveAudio` owns the gesture-resumed context and master compressor.
`audio/HyperdriveRecordings` fetches four bundled CC0 WAV stems on mount without opening a context,
then decodes/caches them per context. Spool pitch rises through charge; its loop crossfades into a
phased machinery bed across ignition. Recorded entry/exit pressure and relay attacks fire once each.
Exit audio waits for reveal progress, including while renderer readiness holds the scene opaque.
Quiet motor/sub synthesis reinforces the recordings; the existing full synthesized mix remains the
fallback on fetch/decode failure. No audio promise gates simulation or renderer readiness.

Suspension mutes the master and defers cue triggering until explicit resume. Abort stops/disconnects
all voices and invalidates late decode callbacks; encoded/decoded buffers survive for the next jump.
Teardown additionally aborts fetching, releases caches and closes the context. A missed sampled cue
uses synthesis immediately and is never replayed when decoding finishes. The next mount can prepare
again, including React Strict Mode remounts. `CREDITS.md` records source/derivative provenance and the
deterministic Node authoring recipe; there is no runtime audio dependency or third-party request.

Failure before commit keeps the source runtime and current cinematic pose. HYPERSPACE readiness has a 12-second deadline.
Cancel before commit retains the source; cancel after commit holds at the destination. Both paths
release restrictions and require an explicit flight resume. Blur/visibility loss holds an active
journey; **Resume journey** continues it. Bounded dt prevents hidden-tab catch-up. Renderer failure
cancels travel and disables launch/map actions. Reset cancels first, then respawns in the current
system. No queued callback may revive a disposed session.

## Flight audio

`FlightSession` composes a single `engine/audio/FlightAudioMix` with player engine and combat
adapters. The mix owns the gesture-resumed context, engine/weapons/traffic channels, low-frequency
filter and common compressor. Important weapon/hit activity ducks the two continuous beds with an
18 ms attack and 240 ms release. Adapters dispose their own nodes; the session closes the shared
context after disposing both. Hyperdrive audio remains a separately owned, mutually exclusive journey
effect. Sound never gates physics, preparation or frame readiness.

`EngineSoundModel` consumes a reused scalar input (actual throttle, requested thrust, speed,
brake/translation, boost/reserve and camera). It adds audio-only spool inertia, single boost/release
edges and a smooth cabin blend. Coasting does not imply thrust. `EngineAudio` fetches six local CC0
stems without opening a context, caches decoding and mixes slightly offset twin turbines, machinery,
boost, jets and short transients. Quiet sine reinforcement doubles as an asset-failure fallback.
The mix has restrained idle/tonal levels, rolled-off highs and subtle boost modulation.
Pause invalidates async attachment and schedules short gain fades/source stops; ended callbacks
disconnect owned nodes. Fading voices count toward a hard cap, even when a suspended context delays
ended callbacks. Teardown aborts fetching and releases caches. Settings survive reset.

`CombatAudio` consumes a read-only structural audio projection supplied at composition, not stores
or DOM input. Seven original filtered pressure/crack buffers are generated once per context. Effect
IDs are consumed while muted; stale cues are skipped. Up to ten transient voices prioritize player
hits/explosions over lower-priority distant fire. The three nearest moving hostile engines are
selected within 1.1 km with small retention hysteresis; culled voices fade. The player turbine buffer
can be shared without transferring its ownership; seeded pressure texture is the fallback.

`SpatialAudioProjection` computes bounded listener-relative positions and a smooth inverse-distance
envelope from logical coordinates, independent of render origin. HRTF panners supply direction;
distance/rear low-pass filtering and a pitch shift capped at ±12% supply restrained flyby movement.
No per-frame React/store updates, fresh audio buffers, or new audio context are needed.

## Input, overlays and accessibility

The DOM interface uses phosphor/amber theme tokens and the bundled Share Tech Mono font. Shared
`InstrumentButton` styles own button states, keyboard focus, and primary-action contrast.
`SegmentReadout` renders local SVG digits with a text alternative. Flight instruments and the bearing
scope consume the existing 10 Hz read models; they do not introduce a second telemetry loop. The
live HUD uses open instrument groups, short reference rules, a continuous bottom contrast gradient,
and the shared button's `hud` variant for quiet header controls. Full frames remain on maps, menus,
and warnings. Speed digits, slim engine bars, and the circular scope provide different visual weights.
The wireframe ship is a static SVG illustration. A pointer-transparent CSS CRT texture is static, with
no flicker, animation, filters on the WebGL scene, or additional renderer resources. Narrow layouts
stack the navigation instrument below velocity/propulsion and allow briefing/map content to scroll.

`PlanetMarkersProjection` runs after the camera rig and samples on the existing chart publication
cadence, plus discrete camera/viewport changes. `PlanetMarkerProjector` converts logical planet
positions through the current render origin and camera matrices, while measuring surface ranges from
the logical ship. Its detached `planetMarkers` read model is presentation-only. Off-screen rocky/gas
planets within the configured range receive edge arrows; rear contacts preserve their turn direction
and carry an AFT label. Labels avoid the heading/instrument banks and are spaced along their edge,
prioritizing nearest contacts when space is exhausted. A selected planet's edge arrow replaces its
interior bearing marker. Maps, paused flight, and jumps suppress the arrows; system identity guards
prevent stale markers from appearing after a handoff. No additional timer or per-frame store updates
are introduced.

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
rings, sky, ship exhaust, cockpit, dust, beacons and tunnel buffers. There are no render targets or
post-processing dependencies. Sky and hyperdrive components reuse geometry and
uniform references between frames. One persistent 12,000-star galactic catalogue supplies point and
trail billboards across all systems. Its 48,000 vertices fit 16-bit indices. The normal sky already
contains every star used by the jump, and the same angular pattern survives the world handoff. Buffers
depend only on sky radius, never system seed or frame time. Stars occupy 35–100% of that virtual radius.
Projecting each star's finite forward exposure produces depth-dependent length and outward speed;
bounded proximity controls width. Virtual depths affect motion only: normal stars render behind the
celestial bodies. Trail widths use CSS viewport pixels. There is no separate corridor particle layout,
time loop or accumulating star simulation.

FlightWorld loads three local, uncompressed GLBs through `useSpacecraftModels`, with remote decoder
loading disabled. The player uses Spitfire; fixed enemy presentation slots alternate Striker and
Insurgent. Slots retain their hostile ID until destruction, preventing surviving hulls from changing
when an earlier enemy is removed. Each hull is one opaque textured mesh (3,512–8,292 triangles).
The offline asset recipe rotates +Z source noses to -Z, centers/scales every vertex inside a 4.8m
radius, transforms measured engine mounts and embeds one 1024px JPEG. A restrained emissive texture
lift preserves panel detail in shade. Existing 5m gameplay spheres and -6m weapon origins are unchanged.
The chase camera stands slightly farther back to frame the wider player hull. Portrait framing
extends only the aft offset, keeping the hull above the taller instrument bank.

The library shares geometry/materials/textures across all ships and persists across resets and jumps.
Hull meshes suppress Fiber disposal. The last library owner disposes each shared GPU resource once,
closes decoded image bitmaps and evicts the loader entry on teardown. A microtask deferral allows
Strict Mode's immediate effect replay to reacquire the resource before disposal. The cockpit remains
procedural.

`spacecraftLighting` places up to eight steady running lamps on actual hull vertices and offsets them
along surface normals. The shared standard material adds local colored light pools and a restrained
view-dependent rim, retaining the original texture and environmental lighting. This uses no per-NPC
scene lights, shadow maps, external textures or post-processing. Player lighting is cyan; hostile
lighting is amber, including the nose/wing lamps visible during head-on approaches.

`ShipEffects` owns one declarative instanced-quad batch/material per craft: physical white-hot nozzle
discs, soft camera-facing halos, four static plume layers and twelve analytic particles per engine,
plus running-lamp glows. The largest hull is capped at 116 quads / 72 moving particles. Particle
seeds/attributes are built once; mounted shader uniforms consume engine power, CSS viewport height
and explicit world time through refs. FlightWorld updates the clock at priority -2, slots synchronize
at -1, hostile poses/power update at -0.5, and sprite uniforms follow at 0. No per-frame allocations,
React state, geometry creation or growing emission history are needed.

Plumes/particles expand aft from fixed local nozzle anchors and stay within a bounded local envelope,
independent of render-origin changes. Ions have a small capped screen footprint, including when a
boost tail approaches the chase camera. A small minimum screen footprint makes distant engine/running
lights readable, capped at an 8m optical radius and faded beyond combat ranges. All sprites depth-test
against hulls/solid worlds and render at the existing exhaust order 30. Hidden/destroyed ships hide
the complete batch. Effects freeze with the paused celestial clock; reduced motion suppresses moving
particles while retaining steady lamps, halos and static plumes. Fiber disposes batch geometry and
materials; shared hull resources retain their existing library ownership.

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

Combat regression tests additionally cover cooldowns/expiry, aim assistance, shield/hull rules,
regeneration timing, high-speed ship and relative projectile sweeps, moving moon boundaries, impact
momentum/energy, AI state transitions, complete five-ship combat, all-system practice encounters,
30/60/144 FPS replay, ten-enemy lifetime bounds, map/departure/respawn cleanup and audio teardown.

Authoritative multiplayer PvP follows as a separate milestone,
with input validation, serialization, prediction and reconciliation built around stable system IDs and
logical poses. No speculative server implementation is included here.
