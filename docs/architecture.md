# Architecture and extension guide

See [galaxy expansion, environments, cities and traffic](galaxy-expansion.md) for the current catalogue,
authority boundaries, streaming budgets, configuration recipes and verification limits.

Milestones 6–7 retain the shared simulation and Node/Colyseus authority and add planetary fields,
terrain LOD, landing and station operations. See [planetary architecture and configuration](planetary-exploration.md)
for scale, deterministic terrain, coordinates, docking, ownership and extension recipes, and
[multiplayer architecture](multiplayer.md) for transport lifecycle and authority boundaries.
The [approach tuning record](planetary-approach.md) describes faster descent, shared landing assistance
and the later pacing/verification changes.
F selects stabilized Travel or Combat. Travel automatically combines clear-space transit and
terrain/station/traffic approach braking; Combat enables shields and weapons at lower speeds.
The existing flight reserve supplies combat weapons, shield upkeep/regeneration and boost; Travel
consumes no energy. Complete mode/reserve snapshots precede flight-only reconciliation. Internal
`travelMode` tracks automatic forward/transit/surface handling, including coasting after V/R release.
W/S leave coasting; reset, arrival, grounding and docking clear surface handling. Tab confirms a
pure contextual suggestion, published with existing HUD telemetry. See [flight modes](flight-modes.md).

## Dependencies and ownership

```text
App → FlightSession → FlightInputManager + FixedStepLoop + FlightController + HyperspaceFlight
                   → CombatSession → CombatSimulation → shared FlightControllers + SphereSolver
                   → ExplorationSession → SystemRuntime + NavigationComputer + HyperspaceController
App → FlightHud + ExplorationOverlay → detached store read models / session actions
SpaceScene → FlightWorld → SystemScene + ship + FlightCamera + CombatScene + HyperspaceTunnel
SystemScene → celestial geometry + CelestialBody + nearest PlanetTerrain worker/cache + AtmosphericSky
            → CityScene + shared planetary generation queue + weather effects + nearby StationScene
CombatSession / MultiplayerWorld → AmbientTraffic → shared flight commands + CombatSimulation
```

Authoritative engine modules import engine contracts and renderer-independent engine/math operations.
They cannot import Three.js, React, DOM, stores, features, renderer objects or clocks. Browser input,
audio and render-origin utilities are client adapters outside the authoritative import graph. `worldTypes.ts` contains serializable tuples/metadata, not Three
objects. Feature orchestration composes engine services and supplies browser adapters/loaders.

| Owner                           | Responsibility                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `engine/simulation`             | Private flight state, quaternion integration, explicit fixed ticks                      |
| `engine/physics`                | Continuous sphere contacts, logical doubles, bounded mass-weighted impulse solve        |
| `engine/planetary`              | Deterministic heights/frames, gravity/density, terrain sweeps and landing configuration |
| `engine/stations`               | Analytical facilities, cached box sweeps, exclusive docking leases and services         |
| `engine/combat`                 | Entity lifetime, shared commands, health, weapons, target leading and AI                |
| `CombatSession`                 | System collider adapter, encounter spawning, read models and optional combat audio      |
| `engine/world`                  | Definition contracts/validation, analytical hierarchy, safe arrival, render conversion  |
| `engine/navigation`             | Target validity, logical distances/ship-relative bearings, pure jump state machine      |
| `features/exploration/data`     | Handcrafted catalogue, explicitly cancellable preparation boundary                      |
| `ExplorationSession`            | One journey, preparation token/abort, active runtime, commit, audio lifetime            |
| `FlightSession`                 | Input lifetime, interpolated logical pose, render origin/pose, arrival/flight handoff   |
| `FlightCamera`                  | Presentation-only follow, rebase compensation, FOV and optional vibration               |
| `SystemScene` / `CelestialBody` | Shared geometry, per-body shader uniforms, world-to-render transforms                   |
| `HyperspaceTunnel`              | Depth-tested corridor mask; the shared Starfield owns point-to-trail morphs             |
| `stores`                        | Discrete state and detached scalar/tuple snapshots; never authoritative transforms      |

## Flight and timing

Metres, seconds and radians; local forward -Z, up +Y, right +X. Positive input pitch raises the nose,
yaw turns right, roll banks right. Combined body rates integrate a normalized quaternion. Keyboard
Up/Down are inverted pitch, Left/Right roll, and Q/E yaw; mouse motion remains pitch/yaw.
Holding W gradually raises stored throttle from 0 to 100%. Releasing W gradually returns throttle to
zero and slows the full velocity vector at normal deceleration. S lowers throttle and applies stronger
braking, taking priority over thrust/boost. Holding S engages bounded reverse thrust once requested
and stored throttle reach zero. Both slow the ship with or without assistance. Boost needs W held.
Braking caps stored throttle at the remaining forward cruise speed. A/D and R/V command local
lateral/vertical velocity. Translation jets use configurable acceleration/speed; braking takes
priority over every axis until the reverse command engages at zero throttle.
Left mouse/Space fires, B begins a patrol, G acquires ahead, H clears, and N/Tab cycles hostile
contacts independently of T/X navigation. UI clicks are excluded from firing; Tab retains normal
button/map focus traversal and Escape pauses regardless of focused HUD controls.

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

Flight speed trends compare consecutive scalar speed publications and their elapsed time, with a
small dead band for settled-speed noise. ACCEL/DECEL lamps work in reverse as well as forward and
clear on pause or discontinuous pose handoffs. Instrument motion runs in CSS, with steady labels
and a reduced-motion fallback; it adds no per-frame React or store updates.

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
acceleration, damping and turn-rate limits. Configurations live in `engine/combat/config.ts` and are
passed into the engine, including mass/radius, handling, shield/hull, gun/missile/railgun/flak statistics and AI ranges.

The fixed tick advances analytical celestial positions, prepares environment velocities, integrates
ship orientation/velocity with the shared controller, resolves swept movement, sweeps existing shots,
and emits new shots at end-of-tick muzzles. Collision-adjusted position/velocity return through
`FlightController.resolveMotion`, preserving orientation, throttle, boost and trip state. Live player
flight-mode intentions do not change NPC controllers; NPCs use stabilized Combat. Health/regeneration/cooldowns and all entity
lifetimes use fixed simulation time. Presentation interpolates ship and projectile endpoints.

Ship and asteroid shapes are conservative spheres. Non-landable celestial bodies use surface radii;
atmospheres, rings and beacons are non-solid. Landable worlds use independent deterministic height sweeps,
and stations use cached oriented boxes. These contacts retain their response velocity through the
sphere solve. Grounded/docked ships have infinite collision mass. `sweepSphere` solves relative segment/sphere time of
impact, including initial overlap, using a stable quadratic root. `SphereSolver` advances bodies
together to the earliest impact, separates overlap, applies a mass-weighted impulse with 0.15
restitution and retains tangential velocity. Environment bodies have infinite mass; moon velocity
comes from consecutive analytical orbit positions. Up to 24 contacts are processed per tick; a crowded
pileup freezes remaining travel instead of tunneling. True celestial positions are restored from the
analytical runtime after solving. All collision math uses logical doubles and never the render origin.
Impact damage is bounded, energy-scaled arcade tuning with a 12 m/s harmless-contact threshold.

Rapier was evaluated against its official [CCD documentation](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/)
and [determinism contract](https://rapier.rs/docs/user_guides/javascript/determinism/). It offers richer
rigid-body contacts and deterministic WASM simulation. The shared arcade controller already integrates
logical doubles, with focused analytical sphere, height-field and box queries. A second body world would require a local
physics origin, kinematic/velocity handoff and lifetime synchronization. The focused analytical
solver keeps one movement authority and adds no dependency. Reconsider Rapier when contact torque,
complex rigid shapes, debris or larger scenes are actual requirements. This solver guarantees neither
cross-platform bitwise replay nor general-purpose rigid-body dynamics.

The default gun uses configured local hardpoints, inherited ship velocity, cooldown, bounded lifetime
and a separate relative travel budget. Alternating fire advances a persistent hardpoint index;
synchronized fire reserves capacity for the complete salvo. Each emitted bolt adds normalized heat.
Cooling runs per fixed tick regardless of selected slot; overheating latches at capacity until the
configured resume threshold, so switching slots cannot reset it. Player reset/respawn clears heat.
Relative-motion sweeps against moving ships/environment truncate both lifetime and range travel. Missiles capture the selected hostile
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
and amber exhaust-flare instances; `CombatScene` shares its bolt buffer with flak pellets. Laser cores share a second
additive instance buffer for restrained halos/trails. Up to twelve analytical sparks/debris instances
per impact/explosion use explicit effect age and seeded directions. Reduced motion suppresses these
particles. There is no per-frame geometry creation or unbounded emission history. Gun, missile, railgun, flak and detonation
cues use the existing bounded optional audio adapter.

`CombatSimulation` centrally owns spawning, destruction, target validity, projectiles and effects.
NPCs are removed on destruction; player death is retained until explicit respawn. Limits are ten
NPCs, 192 projectiles, 32 rail traces, 96 effects, 128 gameplay events and eight encounter asteroids.
The renderer adds at most 1,152 short-lived spark/debris instances and 192 bolt halos. Gameplay events
have a monotonic event ID, explicit simulation time, ship ID and tuple position, with typed fire,
impact, damage, destruction and spawn payloads. Damage includes source identity and actual shield/
hull loss; a destroyed ship cannot emit duplicate destruction or damage events. Effects/audio remain
independent of this bounded event history.

`CombatSimulation.snapshot()`, `FlightController.snapshot()` and `Encounter.snapshot()` return
plain, detached JSON data, including tuples, configurations, commands, health, cooldown/heat, AI
reaction/state clocks, projectile guidance/range, events and pending respawns. Snapshot allocation is
explicit and never in the frame loop. Runtime vectors/controllers stay private to gameplay and are
not sent to stores. These are export contracts, not save loading, schema migration or reconciliation.

`Encounter` owns pure simulation-time scheduling; `CombatSession` adapts it to analytical world
colliders. Arrivals/reset wait eight active seconds before a five-slot patrol. A destroyed slot waits
12 active seconds and reuses its stable system/generation/slot ID. Each respawn searches again around
the current player, rejecting overlap with celestial bodies, asteroids and ships, and receives three
seconds of protection. Failed spawns retry after two seconds. At most ten slots exist; B cannot stack
patrols. Practice uses the shared ship/health/hit path with stationary AI and ends permanently when
its single target dies. Reset/respawn clears pending work, restores the player at the current system's
safe arrival and schedules a new patrol. Departure/disposal makes the schedule dormant.

Target cycling follows stable insertion order and is range-limited. G selects the nearest live
hostile within the configured ship-forward cone/range; H clears. Selection and lead math use logical
coordinates. A constant-velocity intercept outside weapon range/lifetime or without a positive
solution suppresses the lead cue, including the linear-quadratic edge case. Both cameras only project
these results and never choose a target or alter physics.

`ShipAi` uses patrol, pursue, attack, evade, retreat, disengage and destroyed states. Decisions run
on per-ship reaction timers while retained commands feed every fixed tick. Time and an ID-derived
phase seed bounded aim error and weaving; no wall clock or global randomness is used. Reaction time,
aim error, aggression, preferred engagement distance, steering response and critical hull threshold
are shared combat configuration. AI predicts relative movement, steers in its local quaternion frame,
avoids nearby spherical obstacles and fires only while aligned in attack. Critical hull triggers
retreat without firing. Disengagement returns home before reacquiring. FlightController still owns
actual acceleration, speed, inertia and turning constraints. This is steering, not pathfinding or
strategic planning.

In offline mode, maps/focus loss/pause stop the shared clock and clear fire as well as flight input. Hyperdrive
departure clears the encounter and suspends normal collision/combat simulation. Arrival or abort
rebuilds celestial colliders at the matching runtime's current time; existing masked handoff rules
are unchanged. Player damage persists across jumps. Teardown clears entities and closes audio;
reattachment rebuilds colliders for React Strict Mode.

`combatStore` contains only 10 Hz detached readouts, discrete sound preference and HUD projections.
`CombatScene` updates reused refs and fixed-capacity instance buffers for asteroids, lasers and effects;
Fiber owns their geometry/material lifetime. Ten reusable enemy model slots hide unused/far transforms.
Combat projections follow the readout cadence after camera update. Death shows a keyboard-focusable
respawn action. Camera impact offsets are bounded, decay with simulation time and respect reduced
motion. `CombatAudio` uses gesture-started synthesis, consumes each effect ID once, caps transient voices at ten,
and stops/disconnects nodes on pause/mute/departure/disposal; audio never gates simulation.

Multiplayer authority consumes these same ship/weapon/AI rules through `engine/network/MultiplayerWorld`.
`server/createServer` validates intentions and owns room ticks, guest reconnection and transfers.
`features/multiplayer` predicts flight and adapts confirmed snapshots to the existing combat renderer;
it never runs client-authoritative weapons or AI. Multiplayer menus send neutral input while server
world time continues. Combat rewind remains future work. See [the complete network contract](multiplayer.md).

## Logical coordinates and render origin

Each system has its own logical coordinate frame. Positions and radii are gameplay metres with 138–405 km planets
and 25.5–54 km moons. Combat cruise/boost remains 180/360 m/s; Travel covers longer distances. Definitions use parent-relative tuples or circular
orbital parameters. `SystemRuntime` validates/sorts parents once and reuses CPU `Vector3` positions.
A moon inherits its parent's translated position, without inheriting the parent's axial spin.

`RenderOrigin` rounds the interpolated ship position to a 1024-metre grid. Ship and celestial render
positions subtract that origin. Physics, navigation distances, spawn selection, and system IDs do not
change when rendering rebases. `FlightCamera` first translates its existing position by the origin
delta, then follows the new local target, preventing a damping lurch at grid boundaries.

Celestial surfaces farther than 18,000 km are hidden and zeroed. Reference beacons remain
bounded to 60 km. Terrain uses patch-local vertices and logical anchors, with a 20,000 km logarithmic
camera depth range. Sky/tunnel effects follow the nearby camera, and dust wraps
through a 4 km periodic field only when the origin changes. No enormous logical positions enter GPU
transforms. Stable system IDs and logical positions are the network synchronization keys. Floating-origin
changes remain client-only; cross-platform bitwise determinism is not promised.

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

`ExplorationSession.beginJump` derives heading and light-year distance from shared galactic
coordinates. The controller scales transit by distance and keeps planned progress separate from
active elapsed time, so readiness holds can show HOLD without falsifying the flight timer. Detached
HUD snapshots publish at 10 Hz. Shared motion constants and the exit integral live in
`engine/navigation/HyperspaceController.ts`; feature configuration reuses them.

`HyperspaceLaneMap` consumes those snapshots without a separate animation clock or new store state.
The pure feature-owned `hyperspaceLane` helper projects catalogue galactic positions into a
route-relative frame, with departure at zero and destination at one. The SVG foreshortens lateral
context, clips range rings and filters off-chart/crowded system labels. The ship marker uses traveled
distance rather than total cinematic progress, so charging cannot advance it down the lane. Its
small 100 ms transform interpolation stops on holds and for reduced motion. The map remains visible
behind the existing resume/abort prompt; `HyperspaceStatus` still owns journey notifications and
departure guidance. The SVG adds no Three.js resources, physics changes or network fields.

The shared departure planner first checks the galactic bearing, then at most forty cone headings
and the reverse bearing for a clear 1,800 km sweep. Charge aligns the selected local bearing; no
client-authored direction enters authority. Inside an atmosphere/facility, blocked plans remain
outside the jump state machine and network authorization. The pure `hyperspaceDeparture` planner
compares ten boundary escape candidates per attempt, preferring a short outward point with a clear
launch bearing before falling back to the full capsule. It never assigns authority state.
Guidance refreshes after 0.5 seconds or 500 m of movement; launch availability publishes at
10 Hz and is checked again on confirmation. The session closes the chart and restores keyboard
flight, then accepts Tab or the HUD button when the lane is clear. Cancellation/destination changes
clear the suggestion. Compact layouts reserve room for the guidance banner and flight instruments.

`HyperspaceFlight` samples analytical alignment/bank, a quadratic forward creep plus an eighth-power
departure surge and a heavy arrival ease-out. Arrival retains 800 km/s through the reveal; braking begins at 0.882 seconds of exit, after
coverage reaches zero. Its ninth-power velocity falloff matches the 100 m/s physics handoff. Shared
scalar distance functions supply the path and derived coast extent (about 964 km). Offline and
multiplayer both use a near-planet final pose with the lead-in behind it. Normal physics never
integrates hyperspeed. Offline abort adopts the currently displayed safe pose with zero speed; network
cancellation follows the authoritative admission/recovery path.

The 3.4-second entry reaches full extension by 72%, starts its physical surge at 42%, and begins tunnel coverage at
94%, leaving about 0.75 seconds of clear full stretch. A shared crossing impulse starts at 90% and
carries its decay into the tunnel. Over 60% of departure translation precedes half cloud coverage.
The persistent star field supplies every trail;
no particles recycle into another layout. White cores and cyan halos widen into a white crossing
flash, then disappear beneath its fully white peak before the cloud tunnel emerges. No star beams
remain in transit. The inverse transition occurs early in exit, before the braking impulse; beams
reappear beneath the fully white peak. Star heads reset invisibly under the opaque tunnel.
A small full-screen quad renders the optical scatter after the
foreground, only while flashing; the independent 80 m world mask retains its readiness guarantees.
Spatial alpha engulfs the center on entry and opens it on exit, with exact zero/full endpoints tied
to coverage. Reduced motion suppresses trails and flashes and uses a uniform opacity blend.
`hyperspaceVisuals` owns
continuous envelopes, recoil, rattle and smooth seeded noise. Per-journey variation affects only
presentation. Camera impulses and small rotations are removed before each follow update, preventing
accumulation. The camera publishes its final world/view matrices before later frame callbacks sample
star projections, keeping their vanishing point coherent across render-origin shifts and impulses.
Reduced motion suppresses these effects; active journey time drives clouds without a
separate render clock.

A prepared destination cannot commit until HYPERSPACE has run for its minimum duration. Before commit,
`routeArrival` rechecks a source-facing corridor against conservative terrain/foundation, atmosphere,
ring and ancestor orbital-motion bounds. Source clearance covers entry, the distance-scaled transit
and preparation waits. Receiver clearance includes transit remaining after admission, readiness waits
and the exit coast. Cached facility extents bound orbital and rotational movement. Arrival validation
covers the backwards client lead-in as well as forward travel, including authority spawn offsets.
On entry to EXITING the runtime swaps atomically. `FlightSession` changes
the logical frame while the camera compensates both origin and ship translation, preserving relative
position, orientation and FOV. The launch-to-galactic turn settles during the first 20% of the fully
masked transit, before commit. A reset still explicitly snaps the camera.

EXITING stays at zero progress with full coverage until the matching destination SystemScene reports
its first frame after every terrain body has complete six-face base coverage. The renderer reports
readiness on the following frame, after that coverage has drawn. Stale source frames cannot unlock it.
Both CPU preparation and renderer readiness have
bounded 12-second deadlines. The 4.114-second exit stays opaque through 0.504 seconds; coverage falls
over 0.504–0.882 seconds (about 0.38 seconds). Optical trail visibility rises under the white peak
at 0.252–0.336 seconds.
Star travel resets while invisible at handoff, leaving arrival heads anchored instead of reversing
their departure sweep. The flash clears at 0.714 seconds, leaving exactly 3.4 seconds of star-beam
animation to match entry. Full extension holds until 0.882 seconds, then contracts quadratically to
the end. Braking, recoil/lens/audio impact and engine release start together at 0.882 seconds. Lens widening holds
through the reveal before settling, avoiding a premature collapse and second zoom. Chase-camera
spacing also eases from that braking beat. Optical visibility never changes world-mask coverage or readiness.
`FlightCamera` retains the pre-jump speed/FOV contribution through masked relocation, then blends
it toward the normal 100 m/s contribution during braking. Cockpit's immediate lens updates and
chase's damped updates preserve FOV at both system commit and the normal-flight handoff.
The analytical distance integral exactly matches the final pose and handoff velocity. Gameplay
motion values live in engine/navigation/HyperspaceController.ts and the full swept corridor uses those same bounds. Celestial assets use
procedural geometry/shaders. The shared spacecraft GLB library stays mounted
across handoffs. The old keyed SystemScene releases its owned resources.

On cooldown entry, normal keyboard flight returns; pointer-lock recapture needs another user gesture.
Camera mode, flight mode and shared energy reserve survive. The arrival notice lasts three seconds. Charge is
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
and carry an AFT label. Labels reserve the combat instrument columns and heading/lower banks and
hide when no usable area remains. They are spaced along their edge, prioritizing nearest contacts
when space is exhausted. A selected planet's edge arrow replaces its
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
rings, sky, ship exhaust, cockpit, dust, beacons and tunnel buffers. One 512×512 tunnel shadow map
is the only offscreen render target; the crossing scatter needs no offscreen buffer or post-processing
dependency.
Sky and hyperdrive components reuse geometry and
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

The tunnel samples three scales of 3D value noise on three bounded, far-to-near depth shells.
Broad folds, domain-warped wisps and fine luminous filaments create forward flow without an atan
seam, volume raymarch or extra star streaks. `hyperspaceTunnelMotion` supplies a negative texture
clock so fixed cloud features approach the camera and expand outward. Bends advect with the clouds.
One reused CPU sine/cosine pair rotates wall sampling at 0.2 rad/s. Per-shell shader twists add
differential shear and depth-varying folds to that common rotation; no extra noise samples or draws
are added. The held journey clock freezes both effects, and reduced motion supplies a static
sample. Camera movement retains the separate occasional-hiccup envelope.
`hyperspaceLighting` samples bounded smooth light pools
from the journey clock; both the wall shader and foreground lamps consume that same sample.
One broad camera-relative spotlight drifts along an asymmetric path and casts soft shadows, with a
dim opposite fill and restrained ambient.
System sun/ambient/sky fill fade with world coverage so the tunnel light retains contrast.
Only the visible player hull or cockpit casts/receives shadows: one hull draw or fourteen small
cockpit draws into a 512×512 map, with a 32 m light frustum. The light updates its map only during
an active, unheld jump; normal flight has no shadow pass. Fiber owns the light and its map, retained
across journeys and disposed on teardown (roughly 2 MiB color/depth storage).
FlightWorld owns/disposes one shared custom depth material. `shadowDepth` removes logarithmic-depth
chunks only from the shadow pass: comparisons require projected light depth even though the world
camera uses logarithmic depth. Hulls retain their existing shared GLB resource ownership.
Reduced motion freezes light directions/pulses and cloud motion while retaining steady illumination.
The original Kestrel canopy has ribs, instrument housings and faint procedural glass highlights.
It follows the craft's nominal cockpit pose while the camera impulse moves relative to it.
During jumps, glass highlights share the continuous journey clock with the tunnel lamps, avoiding a
reflection reset when the destination world changes.

The transparent depth-tested tunnel mask draws after celestial transparency (order 10), preserving
nearby opaque ship/cockpit depth at a logarithmic 80 m boundary. Star trails draw next (20): normal
stars stay celestial, while stretched optical exposures approach that same foreground boundary;
glass highlights follow (25) and exhaust draws last (30). Fiber owns every declarative geometry,
material and light. These are ordered scene draws plus the single local shadow map, without
post-processing.

Fiber 9 copies shader uniform wrappers when applying props. Update per-frame scalar uniforms through
the mounted ShaderMaterial ref; mutating the original props object's number does not update the GPU.
Vector uniform values are stable reused objects. Reuse scratch vectors/quaternions; never create
geometry or publish React state per frame. The flight frame callback has priority -2 so simulation,
origin and camera update before world/effect presentation. No positive-priority callback takes over
rendering.

Reduced motion disables dynamic FOV, turbulence, recoil/rattle, tunnel animation, star trails, light crests,
moving light/glass highlights, alignment bank and axial spin. The tunnel still
masks a transition and progress remains legible. Device pixel ratio stays bounded. LOD/adaptive quality
and broader hardware profiling are future improvements, not a promise of universal 60 FPS.

## Adding weapons and enemy configurations

- For another laser loadout, define a `ShipConfig` in `engine/combat/config.ts`. Set local -Z-forward
  hardpoint tuples, alternating/synchronized mode, projectile speed/damage/range/lifetime, inherited
  velocity fraction, cooldown and heat per bolt/cooling/resume threshold. Place muzzles ahead of the
  hull. Synchronized salvos reserve all slots before consuming cooldown/heat. Keep the shared sweep,
  damage and event paths; add behavior tests for new boundaries.
- A new weapon mechanism extends `WeaponSlot`/command/config contracts and the focused firing branch
  in `CombatSimulation`, reusing nearest-hit collision and centralized damage. Extend input bindings,
  `WEAPON_CHOICES`, telemetry, audio timbre/effect consumers, and document the actual controls. Test
  release/pause/departure cancellation, inherited velocity, environment/friendly filtering, complete
  salvo capacity, range/lifetime and fixed-step replay. Never apply damage from a renderer or tracer.
- Define an enemy ship by composing `ENEMY_SHIP` with a distinct name, defense, handling, mass/radius
  and loadout. Tune `AiConfig` reaction time, aim error, aggression, maneuverability and retreat
  threshold independently of its appearance. `CombatSession.spawnSlot` is the explicit encounter
  composition point for choosing a loadout per slot; keep the stable slot ID on replacement.
- Add appearance through the spacecraft library/presentation slot composition, retaining shared asset
  ownership. Weapon hardpoints belong to gameplay configuration, engines/lamps to the model. Check the
  visual hull fits the collision sphere. Test every system's safe arrival/spawn and inspect both
  cameras, floating-origin effects, pause, respawn and final resource teardown.

## Adding a system, planet or moon

1. Add a JSON-compatible `StarSystemDefinition` to `engine/world/systems.ts` with a new
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
never fork the entire system renderer for a single world. Planetary LOD is presentation layered over
the same deterministic height field and logical hierarchy; use the detailed extension recipe linked above.

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

Authoritative multiplayer PvP/cooperative PvE is implemented in Milestone 5. See the
[dated verification record](milestone-5.md) for real-client tests, two-browser checks and 2/8/16-client
load measurements. Milestones 6–7 add planetary/station systems; see the
[acceptance record](milestones-6-7.md) for their current evidence and limits.

## Seeded planetary visual generation

The shared planetary field separates fast terrain height queries from richer surface descriptions
(elevation, slope, temperature, moisture and normalized physical cover). Spherical-domain seeds and
bounded landform modifiers drive every archetype; engineered irregular foundations preserve explicit
catalogue anchors. Workers sample the same final field when baking orbital cube faces and terrain
attributes. Rendering never supplies heights back to physics.

SystemScene owns a two-worker PlanetGeneration queue for terrain, short surface-map strips,
scenery cells and transport ribbons. Visible root/refinement work has priority. Job IDs and the
surface revision prevent obsolete callbacks from adopting disposed work. React owns presentation
selection at low frequency; mounted refs own frame-rate transforms and uniforms. Each owner releases
its buffers/textures, while published maps are released after replacement commits. Incremental GPU
allocation estimates include mipmaps and fixed instance capacities.

A small pure building-recipe module supplies normalized parts to renderer geometry and oriented
collision boxes. District layouts and the authored pad corridor remain static and serializable.
Only the nearest city streams full-detail blocks; distant proxies and night footprints remain cheap.
Cached rotated box bounds reject irrelevant sweeps before the existing precise solver. Decorative
vegetation and small rocks never enter authority or network snapshots.

See [visual generation and acceptance](planetary-visual-generation.md) for budgets, benchmark
commands, reference scenes, actual results and remaining limits. Protocol v5 marks the incompatible
surface/collision revision without expanding the snapshot payload.
