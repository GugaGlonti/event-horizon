# Event Horizon

A browser-based space flight, exploration, and PvE combat game, built one system at a time.

**Milestone 5 — Multiplayer PvP & Cooperative PvE.** Fly the Kestrel through Solara, Vesper
and Aether alone or with other guest pilots. A Node/Colyseus server owns movement, shared AI,
weapons, damage, respawns and system transfers. Shared flight prediction and remote interpolation
keep browser controls responsive. The existing maps, cameras, floating origin, procedural worlds
and cinematic hyperspace remain in use. Terrain and landing are the next milestone.

## Start multiplayer

```bash
npm ci
npm run server  # terminal one, default ws://127.0.0.1:2567
npm run dev     # terminal two
```

Open the Vite URL in two tabs/windows, enter callsigns, choose **Connect multiplayer**, then
**Keyboard flight**. Guests in the same public system instance share PvP and AI encounters.
Menus release controls while the server keeps simulating; other ships can still damage you.
Use the galaxy map for authoritative cinematic transfers between rooms. Reconnection restores a
guest within the default 15-second grace; expired guests cleanly rejoin with a new identity.

Optional settings are listed in `.env.example`. `VITE_MULTIPLAYER_URL` is the public endpoint;
Node settings control host/port, tick/snapshot rates, capacity, relevance and reconnection grace.
Development diagnostics expose RTT, tick/FPS, corrections, room IDs and latency/jitter/loss controls.
See [multiplayer setup, protocol and architecture](docs/multiplayer.md) and the
[Milestone 5 verification record](docs/milestone-5.md) for measured limits and remaining caveats.

## Start exploring offline

Requires **Node.js 22.12+ on the 22.x line, or Node.js 24+**, npm 10+, and a desktop keyboard with a
modern WebGL 2 browser. Hardware acceleration is recommended. `.nvmrc` selects Node 22.

```bash
nvm use                    # optional, with nvm
npm ci
npm run dev
```

Open Vite's printed Local URL (normally `http://127.0.0.1:5173`). Choose **Keyboard flight** or **Fly
with mouse**. You start stationary near Pelagos in Solara, facing its blue hemisphere. Hold W to raise
throttle gradually from 0% to 100%; release W to ease back toward a stop. Hold S for stronger braking.
T selects the next contact, including the moon Lyra. L opens
the local system map; M opens the galaxy map. Select Vesper and choose **Engage hyperdrive**.

No API keys, external services, or separate asset downloads are required. **No dependencies were added
for Milestones 3 or 4.** All celestial definitions, shaders, audio, and interface assets are local.

The Kestrel uses Quaternius's blue **Spitfire** hull; patrols mix red **Striker** and **Insurgent**
hulls, each with its own engine mounts. Three bundled GLBs share geometry/materials across enemies
and total about 1.6 MB, including 1024px textures. Their silhouettes fit the existing collision spheres;
flight handling, weapons and damage rules are unchanged. The cockpit remains the original procedural
flight deck. See [CREDITS.md](CREDITS.md) for the CC0 release, source mirror and asset preparation recipe.

White-hot engine cores have soft cyan player / amber enemy halos. Steady nose, wing and dorsal
running lights, colored light spill and a restrained hull rim keep ships visible against dark space,
including approaching enemies. Short exhaust particles strengthen with thrust and boost. Effects
pause with flight; reduced motion retains steady lights and plumes while suppressing particles.
Lights remain occluded by solid objects, and their small distant glow stays readable at combat ranges.

The interface is a 1980s flight terminal: green phosphor displays, amber seven-segment speed
and heading readouts, segmented engine gauges, a bearing scope, and a wireframe Kestrel schematic.
Flight instruments float over the scene with short reference rules, slim gauges, and a quiet header;
the briefing, survey charts, and warnings retain framed terminal panels. Controls share visible
keyboard focus. A static CRT texture adds scanlines without flicker or animation. The bundled
Share Tech Mono font is distributed under the SIL Open Font License; see
[`public/assets/fonts/OFL-ShareTechMono.txt`](public/assets/fonts/OFL-ShareTechMono.txt).

## The charted reaches

| System     | Central star   | Worlds                                                          | Moons              | Arrival          |
| ---------- | -------------- | --------------------------------------------------------------- | ------------------ | ---------------- |
| **Solara** | Warm yellow    | Pelagos (blue terrestrial), Cairn (desert), Aureole (gas giant) | Lyra, Tala         | Pelagos approach |
| **Vesper** | Dim red-orange | Umbra (dark rock), Rime (ice), Nacre (ringed gas giant)         | Mote, Sable, Veil  | Nacre approach   |
| **Aether** | Blue-white     | Pyra (volcanic), Serein (ocean), Prism (unusual ringed giant)   | Cinder, Lilt, Opal | Serein approach  |

Reusable shaders provide ocean/land/cloud patterns, desert strata, icy fractures, volcanic seams,
crater-like variation, and gas bands. Planets have day/night lighting and axial rotation. Optional
Fresnel atmospheres brighten toward the limb; banded translucent rings receive a planet shadow.
System palettes, ambient light and seeded nebula backgrounds give each destination its own
appearance. A shared distant starfield preserves the galactic sky across journeys. Moons follow
deterministic inclined orbits. Planet positions are deliberately fixed.

## Controls

| Input              | Action                                                         |
| ------------------ | -------------------------------------------------------------- |
| Mouse movement     | Pitch/yaw; steering gently recenters when movement stops       |
| ↑ / ↓              | Nose down/up (inverted pitch)                                  |
| ← / →              | Roll left/right                                                |
| Q / E              | Yaw left/right                                                 |
| W                  | Gradually raise throttle to 100%; release to slow down         |
| S                  | Slow down and lower throttle; hold to stop                     |
| Shift              | Hold for engine boost                                          |
| A / D              | Strafe left/right in the ship’s local frame                    |
| R / V              | Translate up/down                                              |
| Z                  | Reverse thrust; W takes priority                               |
| Left mouse / Space | Hold to fire the selected weapon                               |
| 1 / 2 / 3 / 4      | Select gun / homing missiles / railgun / flak scattergun       |
| B                  | Start a five-ship patrol encounter when the sector is clear    |
| N / Tab            | Cycle nearby hostile targets during flight                     |
| G / H              | Select nearest hostile ahead / clear combat target             |
| C                  | Switch chase/cockpit camera                                    |
| F                  | Toggle flight assistance                                       |
| M                  | Open/close galaxy map                                          |
| L                  | Open/close local system map                                    |
| T / X              | Cycle/clear local navigation target                            |
| Esc                | Close map, pause flight/release mouse, or abort an active jump |

Map shortcuts are configured in `features/flight/config.ts`. Maps release pointer lock, clear held
input, and pause flight and celestial time. Closing a map returns to the flight briefing; **Resume
keyboard flight** in the local map is an explicit shortcut back into the game. Map dialogs contain
keyboard focus and expose selected/disabled actions to assistive technology. The menus remain usable
without pointer lock.

The local chart displays every celestial body, approximate player position, and surface distances.
Choose a marker or a body in the contact list to target it. Moon orbits are enlarged on this diagram
for legibility. The flight HUD shows the target's name/type, surface distance, course alignment, and a
ship-relative directional marker, including when the destination is behind you. X clears the target
and exposes the nearest contact.

While flying, edge arrows identify up to three off-screen planets within **30 km of their surface**.
Each shows its name and surface distance; **AFT** marks a planet behind the camera. The selected
planet is amber, and other nearby planets use phosphor green. Arrows follow the actual chase/cockpit
view, stay clear of the compass and instrument bank, and separate nearby labels. Crowded compact
layouts prioritize the nearest planets. Stars and moons retain normal target selection. These edge
markers hide while paused, in maps, during hyperspace, or when the combat instruments leave no room. Range and count are tunable in
`features/flight/config.ts`.

**Controls** opens the briefing. **Reset flight** cancels any pending jump and returns the craft to a
safe arrival in its current system, restoring engine reserve and clearing momentum. Camera and
assistance preferences survive reset. Boost lasts about four seconds, recharges after a delay, and
requires releasing Shift after depletion to rearm at 18% reserve. Assistance damps drift and angular
momentum; without it, use counter-steering to settle rotation. Releasing W gradually lowers throttle
and slows the ship; S applies stronger braking. Both work with assistance on or off and override boost.
Hold W with Shift to boost.

## Combat sandbox

Choose **Practice target** in the briefing for a stationary shielded contact 260 m ahead. Hold Space
to fire the selected weapon and destroy it; the HUD confirms the sector is clear. Choose **Engage patrol / B** or press B in flight
for five AI ships and a small local asteroid field. Each arrival/reset also schedules a patrol
after **eight seconds of active flight**; choosing practice replaces this with a finite exercise.
Destroyed patrol slots return after **12 seconds**, keeping their system-scoped IDs and gaining
**three seconds of spawn protection**. The HUD reports the next reinforcement. Every spawn searches
clear space around the current player, outside ships and solid celestial bodies; blocked slots retry
after two seconds. Maps and pauses freeze these timers. B can replace a cleared wave immediately.
Reset, player respawn and departure cancel all pending reinforcements. Arrival starts a new schedule.

G acquires the nearest hostile within a forward 60° half-angle and 3.5 km. N or Tab cycles contacts
within 3.5 km; H clears the combat target. T/R retain their navigation/lift bindings. Tab still moves
keyboard focus through buttons and map controls when those controls have focus. The amber bracket
follows the selected ship; edge brackets and **AFT / TURN** identify off-screen/rear contacts. The gun's diamond is a constant-velocity lead cue:
bring it toward the center gunsight. A small **2.3°** aim-assist cone helps shots toward the selected
contact; it does not turn the ship or bypass obstacles. Gun bolts inherit ship velocity. T/X still select
celestial navigation contacts, independently of the combat target.

The player has **100 shield / 100 hull** and
regenerates **10 shield/s after four seconds without damage**. Shields absorb hits before hull.
Patrol craft have 45 shield / 55 hull and slower, weaker guns. The default gun has a cooldown, a
2-second lifetime and a separate 2 km relative-travel limit; there is no ammunition resource. Its
two configured hardpoints alternate by default, with synchronized firing available in configuration.
Each bolt adds 7.5% heat; cooling removes 14%/s. Reaching 100% locks the cannons until heat falls to
30%. Heat persists across weapon changes and freezes with gameplay during pauses/jumps; reset and
player respawn clear it. The HUD displays heat, overheat, and incoming damage. Friendly fire is
disabled. Ships, asteroids, planets, moons and stars are solid spherical boundaries; lasers stop at the first solid
contact. Impact damage scales with mass and closing speed; low-speed contacts are harmless. Rings,
atmospheres and reference beacons remain visual effects.

Select weapons with the number row, numpad, or the HUD's **1 / 2 / 3 / 4** buttons:

| Key   | Weapon          | Behavior                                                                                                                                                     |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | Default gun     | Rapid alternating bolts: 16 damage, 1,000 m/s, 0.14 s cooldown. Selected-target aim assist and lead cue.                                                     |
| **2** | Homing missiles | 85 damage, 320 m/s, 1.4 s cooldown, seven-second lifetime. Bright amber exhaust flare.                                                                       |
| **3** | Railgun         | Hold Space to charge for 0.8 s, then fire a precise 120-damage shot out to 3.5 km. Central emitter, straight blue-white tracer lasting 0.25 s, 1.6 s reload. |
| **4** | Flak scattergun | 12 pellets × 10 damage in an 8° cone, 650 m/s, 0.75 s cooldown. Amber scatter burst; pellets expire after 0.5 s (325 m relative travel).                     |

Missiles acquire the N-selected hostile within **2.2 km** and **60° of the nose**; the HUD shows
**TARGET LOCKED**. They turn gradually toward that launch target and keep it when selection changes.
Without a lock, or after losing the target, they fly unguided until impact or expiry. The railgun
hits the first solid contact immediately on completing its charge. Its charge meter and central coil
show progress; releasing Space, switching weapons or pausing discards a partial charge. Holding Space
repeats the reload/charge cycle. The brief tracer is cosmetic and applies damage once. Flak spreads
without aim assist, inherits ship velocity, and is strongest on close passes.

All weapons obey environment collisions and share a reload timer, so switching does not bypass
cooldowns. Selection survives pause and hyperspace; reset/respawn selects the default gun. AI patrols
use the default gun. Reduced motion keeps the railgun coil stationary while retaining charge feedback
and the tracer's fade.

AI patrols, detects the player, pursues, leads its shots, attacks while aligned, breaks away at close
range or when hit, retreats below 25% hull, avoids nearby obstacles, and returns home after
disengaging. Decisions run every 0.15 s; ID-seeded aim error, aggression, preferred distance and
steering response are configurable. The flight controller still bounds acceleration, speed and turns.
Enemies use the same flight controller, collision solver, weapon and damage rules as the player. Strafe, brake and boost
to spoil their aim. Destroyed enemies are removed immediately. In offline mode, player destruction pauses combat and
offers **Respawn / keyboard flight** at a safe arrival, restoring hull, shields and boost with three
seconds of protection. Maps, Escape, focus/visibility loss and pointer-lock release pause the fight
and clear held fire. Jumping leaves the encounter behind and preserves player damage.

Combat effects use bounded instance buffers, bolt halos/trails, shield flashes, hull sparks,
expanding destruction shells, short radial debris, engine plumes and restrained impact camera
movement. Reduced motion suppresses impact shake and moving combat particles.
**Combat audio on/off** in the briefing controls optional synthesized fire/hit/destruction cues;
hyperdrive audio retains its separate map setting. Sound unlocks through a flight-start gesture.

Ship mass/radius/handling, defenses, gun/missile/railgun/flak stats, AI thresholds and encounter size live in
`src/engine/combat/config.ts` (re-exported by the feature configuration). The default is five enemies; configuration supports up to ten.
The shared simulation exposes detached JSON snapshots and bounded, attributed spawn/fire/impact/
damage/destruction events. The multiplayer room consumes these same authority rules. Progression, missions and persistent
combat saves remain future work. See the [combat acceptance record](docs/milestone-4.md) and
[weapon/enemy extension instructions](docs/architecture.md#adding-weapons-and-enemy-configurations).

## Spacecraft audio

**Engine audio on/off** in the briefing controls the Kestrel's local machinery/reactor mix. Idle is
restrained; W raises a twin-turbine bed, Shift adds boost pressure, release leaves a winding-down
tail, and S activates pulsed braking jets. Strafe/lift/reverse commands use quieter translation
jets. Sound follows actual throttle, boost reserve and commands; coasting speed does not sustain
full engine noise. Cockpit mode smoothly softens the upper frequencies and overall level.

Engine and combat sound share one gesture-unlocked Web Audio context, three channels and a common
peak-control stage. Shots and player hits briefly lower engine/traffic levels with a smooth recovery.
Gun, missile, railgun, flak, shield, impact and explosion cues use distinct short pressure/crack
textures. No steady sawtooth alarm or continuous weapon tone is used.

**Combat audio on/off** also controls nearby enemy engines and spatial enemy shots. At most three
moving enemy ships are audible within 1.1 km; distance falloff, HRTF positioning, softer rear/distant
sound and a bounded approach/recede pitch shift keep flybys directional without a constant crowd
drone. Stationary practice targets have no engine loop. Headphones make direction easiest to judge.
Pause, maps, destruction, reset and departure silence normal-flight audio; arrival restores it when
keyboard flight resumes. Async sample loading never controls flight or revives cancelled playback.

Engine stems use existing CC0 sources; weapons are original synthesized buffers. No new dependency
or external service is needed. Source credits and offline preview commands are in [CREDITS.md](CREDITS.md).

## Hyperspace

The galaxy map highlights your current system, shows destination details and its arrival anchor, and
requires another system to be selected. Jumping to the current system, uncharted destinations,
overlapping jumps, and jumping during cooldown are unavailable.

| State        | Default duration | Behavior                                                                  |
| ------------ | ---------------- | ------------------------------------------------------------------------- |
| CHARGING     | 3.2 s            | Bank, align to the destination, level out and charge; compact HUD readout |
| ACCELERATING | 1.3 s            | Long star trails keep moving through buildup, followed by a sharp surge   |
| HYPERSPACE   | At least 3.4 s   | Flowing blue corridor masks preparation; ship/cockpit remain visible      |
| EXITING      | 1.15 s           | Await the destination's first frame, collapse trails, coast and settle    |
| COOLDOWN     | 4 s              | Keyboard flight resumes at 100 m/s; another jump remains unavailable      |
| IDLE         | —                | Hyperdrive ready                                                          |

Shared galactic coordinates determine departure and arrival headings. The ship approaches from the
source-facing side of the destination's primary target, facing onward along the route. Swept clearance
checks include body surfaces, atmospheres, rings and near-term moon movement. A blocked departure
shows a reason in the galaxy chart; move clear before trying again. Arrival lanes leave room for the
exit coast and frame the primary world at a readable distance.

Timing lives in `engine/navigation/HyperspaceController.ts`. `HyperspaceFlight` samples bounded local
trajectories outside normal physics; no enormous velocities or galactic coordinates reach the GPU.
A persistent 12,000-star sky supplies every entry streak. Stars have varied virtual depths: projecting
a forward exposure gives nearby stars broader, faster trails and distant stars shorter streaks. White
cores have soft cyan shoulders and blue halos. Long trails remain readable for about 0.3 seconds before
the tunnel reveal while continuing to move outward; most travel stays concentrated at ignition.
There is no replacement particle field or recycled stream of new streaks. A brief exposure crest
merges the stars into three layers of irregular blue clouds, bright wisps and dark channels flowing
past the craft. Passing blue light catches the Kestrel's canopy, instruments and subtle glass glints.

The bounded 5.2 km departure moves nearby worlds decisively at ignition, after checking the entire
corridor for clearance. Arrival waits for the matching destination's first frame, holds the first 14%
of exit opaque, then reveals the scene over about 0.1 seconds as the stars contract. Most deceleration
happens under cover; the remaining coast settles into 100 m/s flight. The camera preserves its relative
pose across the system switch. Short damped recoil and chassis rattle give ignition/exit weight, with
restrained FOV changes and a quiet cruise; the cockpit stays attached to the craft during the impulse.

The charging readout disappears during transit. Escape/abort remains in the HUD footer, with a brief
arrival notice after exit. Normal flight instruments return with control. A central prompt appears
only when a journey is held after losing focus. Optional audio layers edited CC0 machinery and motor
recordings: a rising spool, a phased stereo transit bed, and distinct entry/exit relay and pressure
impacts. Quiet synthesized bass reinforces the recordings; synthesis also provides a fallback if
loading/decoding fails. The exit cue follows the visual reveal, and a compressor controls peaks.
Disable audio in the galaxy map. Bundled sound sources, licences and the offline processing recipe
are documented in [CREDITS.md](CREDITS.md).

Arrival preserves engine reserve, trip distance, assistance and camera choice, handing back a
controlled 100 m/s forward motion with matching throttle. Hold W to accelerate after arrival;
otherwise the ship gradually slows. Keyboard control returns without another click. Mouse users can
pause and select **Resume with mouse** to recapture through a user gesture.

Escape or **Abort jump** cancels safely. Before arrival commit, you remain in the source system. After
commit, you remain at the destination's safe arrival. Reset/unmount invalidate pending preparation,
so late results cannot activate a system. A rejected/invalid destination or preparation timeout keeps
the original system and offers normal flight again. Blur/hidden tabs hold an active journey until
**Resume journey** is clicked; a bounded delta prevents suspension from skipping the sequence.

Reduced-motion preferences disable recoil/rattle, speed/jump FOV changes, tunnel animation, exposure
flashes, moving light/glass highlights, visual axial spin, alignment banking and animated star trails.
Essential alignment, orbital positions, charge feedback, and travel remain available.

## Stack and commands

React 19, strict TypeScript 7, Vite 8, Three.js r182, React Three Fiber 9, Drei 10, Zustand 5,
Tailwind CSS 4, Biome 2, Vitest 5, Colyseus 0.18, Zod 4 and the tsx Node runner. Resolved versions are in `package-lock.json`. Three is pinned to
r182 because Fiber 9 constructs `Clock`, deprecated in later Three releases; update the matching types
and verify Fiber compatibility before changing that pin.

| Command                    | Behavior                                          |
| -------------------------- | ------------------------------------------------- |
| `npm run server`           | Start the Node multiplayer authority              |
| `npm run server:dev`       | Watch authority/shared source changes             |
| `npm run test:integration` | Real server/client lifecycle and combat tests     |
| `npm run test:load`        | Simulated 2/8/16-client measurements              |
| `npm run dev`              | Vite development server                           |
| `npm run build`            | Strict type check and production build to `dist/` |
| `npm run preview`          | Serve the built `dist/` locally                   |
| `npm run lint`             | Biome formatting/import/lint checks               |
| `npm run format`           | Apply formatting, import organization, safe fixes |
| `npm run typecheck`        | Check client, authority, tests and scripts        |
| `npm test`                 | Run unit and real-server integration tests        |
| `npm run check`            | Lint, tests, type-checked production build        |

CI runs npm ci, lint, tests, and build. Hosting is not configured; `dist/` can be served as static
files. Defaults work without an environment file. `.env.example` documents optional client/server settings;
`VITE_` values are public client configuration, never secrets.

## Architecture and coordinates

```text
src/engine/
  math/                   Renderer-independent vector/quaternion operations
  network/                Validated protocol, authoritative world, prediction and interpolation
  input/                  Active-flight keyboard and pointer-lock adapter
  simulation/             Fixed-step flight physics and scalar telemetry
  physics/                Continuous sphere sweeps and mass-weighted impact response
  combat/                 Shared ships/commands, health, lasers, targeting and deterministic AI
  world/                  Serializable definitions, validation, analytical orbits, render origin
  navigation/             Pure target/bearing calculations and hyperspace state machine
src/features/
  multiplayer/            Guest transport, prediction adapter, remote presentation and UI
  combat/                 Encounter/world adapter, bounded effects, HUD and optional audio
  exploration/
    data/systems.ts       Compatibility export of the shared engine/world catalogue
    ExplorationSession.ts Preparation, jump lifecycle, system commit, navigation publication
    HyperdriveAudio.ts    Gesture-started layered jump audio and cleanup
    audio/                Local CC0 stems, cached decoding and recorded voice lifetime
    components/           Galaxy/local maps, target HUD, journey status
    rendering/            System scene composition and GPU hyperspace effect
  flight/                 Input/session lifetime, interpolation, camera, HUD, tuning
  planets/                Reusable celestial geometry, surface/atmosphere/ring shaders
  spacecraft/             Original Kestrel model, independent of physics
  space/                  Seeded stars, nebula backdrop, periodic dust and approach beacons
server/                   Colyseus system rooms, guest/travel lifecycle and fixed authority loop
scripts/loadTest.ts       Real-client load and bandwidth measurements
src/stores/               Discrete choices and detached read models, published at 10 Hz
```

Logical positions use JavaScript double-precision metres within a system; time is in seconds and
angles in radians. Astronomy is compressed for playable travel times. Local forward is **-Z**, up
**+Y**, right **+X**. A body's position is relative to its parent; moon orbits are evaluated from an
explicit shared simulation time, independently of the order of definitions or frame history.

`FlightController` retains the normal-flight logical pose; a bounded analytical journey supplies the
presented pose during jumps. A 1024-metre grid origin near the player converts that pose into
render space without moving simulation coordinates. The camera translates by each origin change
before applying follow damping. Celestial transforms subtract the same origin; distant bodies are
culled before large transforms reach the GPU. The sky and hyperdrive are camera-relative, and local
dust wraps through a bounded periodic field. HUD distances always use logical coordinates.

Offline flight remains fixed at **120 Hz**, bounded to **0.1 seconds / 12 catch-up ticks**.
The server defaults to **30 Hz inputs / 20 Hz snapshots**, with four shared physics substeps per
authority tick. Local prediction restores acknowledged state and replays newer inputs; remote poses
use quaternion interpolation and bounded extrapolation. Flight/combat HUD telemetry publishes at
**10 Hz**. Authoritative rules use shared math without React, Three.js, DOM, features or stores.

See [architecture and extension guide](docs/architecture.md), including how to add a system or moon.

## Verification and limitations

Automated tests cover flight/input behavior plus definitions, invalid parents/cycles/duplicates,
orbits, coordinate round-trips/rebases, target selection/bearings/distances, safe arrival selection,
all jump phases, invalid destinations, cancellation, async failure/late completion, timeout,
focus/visibility, reset/disposal, camera independence and bounded recoil, arrival state, keyboard
restoration, audio cue timing/suspension/cleanup, async audio cancellation/cache reuse and bundled
PCM levels/loop boundaries. Combat tests cover shield absorption/regeneration, cooldowns/lifetimes,
relative-motion projectile hits, fast ship sweeps, moving moon boundaries, mass-weighted impacts,
AI transitions, 30/60/144 FPS command replay, complete moving dogfights, bounded ten-enemy runs,
all-system practice and automatic patrol encounters, safe timed enemy respawn, heat/overheat recovery,
synchronized/alternating hardpoints, acquire/cycle/clear targeting, detached JSON state and attributed
events, mouse fire, map/fire suppression, respawn, departure cleanup and audio lifetime.
Weapon tests cover all four slots, reload preservation, bounded missile steering/lock loss,
railgun charge/cancellation, central emission under rotation, nearest-hit/range rules, tracer expiry,
flak spread/inherited velocity, short-range damage, complete-salvo capacity and frame-rate replay.

The historical Milestone 4 consolidation run passed **295 tests across 28 files**, TypeScript checking, Biome linting
and the production build. Browser playtesting covered practice kills in all three systems, keyboard
and left-mouse fire, overheat feedback, live patrol kills, incoming damage, player destruction/respawn,
chase/cockpit cameras, maps, the complete Solara → Vesper → Aether → Solara journey and the opaque
tunnel mask. Compact 390 × 844 and 390 × 600 layouts were inspected and instrument overlap corrected.
Console inspection returned no warnings/errors. The embedded browser rejected pointer capture;
keyboard flight resumed successfully. Native mouse capture, audio perception, reduced-motion hardware
coverage and formal GPU frame-time profiling remain manual verification limits. Enemy replacement
and exact regeneration timing are covered by headless tests. See the
[dated acceptance record](docs/milestone-4.md) for ownership, evidence and remaining verification limits.

- Arcade flight and compressed distances; no gravity, terrain or landing. Spherical colliders are
  conservative around ship wings and asteroid edges. There is no contact torque, friction, mesh
  damage or rigid-body debris. Dense pileups use a conservative bounded solver that may drop the
  rest of a tick's travel. Moving projectiles/ships/moons use linear sweeps within a 120 Hz tick.
- Rapier was evaluated for CCD and deterministic rigid-body support. This milestone extends the
  existing double-precision movement model with an analytical sphere solver instead of adding a
  second integrator and WASM dependency. See the architecture notes for the tradeoff.
- Offline encounters are local, automatically scheduled after arrival and reset on departure. Practice remains
  an opt-in finite exercise. AI uses simple steering and obstacle avoidance;
  it has no tactical planning or pathfinding. Aim leading assumes constant target velocity.
- Bundled procedural systems are prepared in memory; there is no network asset streaming or save-game
  persistence. Offline reloading starts in Solara; multiplayer can recover a guest in its current room. There is no touch/gamepad piloting.
- Hyperdrive audio uses transformed CC0 preview recordings (about 1.1 MB of local PCM assets) and a
  synthesized fallback. It is an original film-inspired interpretation; source fidelity is limited by
  the public MP3 previews. Broader environmental sound and post-processing remain future work.
- Rendering continues while paused. Pixel ratio is bounded; geometry, buffers, and scratch vectors
  are reused. Approximately 60 FPS is a target, not a guarantee across hardware. Wider profiling and
  adaptive quality/LOD remain future work.
- Vite retains its large-chunk advisory for Three.js application/scene bundles. Unsupported WebGL
  browsers receive a fallback; automatic graphics-context recovery is not implemented.
- Multiplayer is an in-memory guest prototype, tested locally up to 16 clients. Snapshot bandwidth
  increases with close combat; there is no persistence, combat rewind, distributed hosting or verified
  thousand-player capacity. Cross-platform bitwise determinism is not promised. See the measured
  [network limitations](docs/multiplayer.md#extension-rules-and-remaining-limits).

## Roadmap

- [x] Milestone 1 — Typed foundation, modular renderer, tooling, CI
- [x] Milestone 2 — Inertial flight, boost/assistance, cameras, original spacecraft, HUD
- [x] Milestone 3 — Three systems, procedural celestial bodies, orbital moons, navigation/maps,
  floating origin, cinematic hyperspace, safe transitions
- [x] Milestone 4 — **Space Combat & PvE**: shared ships, swept collisions, lasers, damage, AI,
  heat/overheat, combat targeting, automatic patrols and timed reinforcements, destruction/respawn,
  HUD, audio, JSON snapshots and gameplay events
- [x] Milestone 5 — Multiplayer PvP & Cooperative PvE: authoritative rooms, prediction, interpolation,
  shared AI/combat, guest reconnection and cinematic cross-system transfers
- [ ] Milestone 6 — Planetary Atmospheres, Terrain & Landing
- [ ] Later — Larger battles, squadrons, missions, persistent multiplayer progression, wider hardware support

Licensed under [MIT](LICENSE).
