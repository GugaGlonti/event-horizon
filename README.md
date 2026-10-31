# Event Horizon

A browser-based space flight, exploration, and future combat game, built one system at a time.

**Milestone 3 — Galaxy exploration & hyperspace.** Pilot the original Kestrel through three handcrafted
star systems. Track planets and moving moons, consult local and galaxy charts, charge the hyperdrive,
and emerge into a different sky without reloading the page. Combat, AI, multiplayer, detailed terrain,
and landings belong to later milestones.

## Start exploring

Requires **Node.js 22.12+ on the 22.x line, or Node.js 24+**, npm 10+, and a desktop keyboard with a
modern WebGL 2 browser. Hardware acceleration is recommended. `.nvmrc` selects Node 22.

```bash
nvm use                    # optional, with nvm
npm ci
npm run dev
```

Open Vite's printed Local URL (normally `http://127.0.0.1:5173`). Choose **Keyboard flight** or **Fly
with mouse**. You start stationary near Pelagos in Solara, facing its blue hemisphere. Hold W to raise
throttle; release W to hold that setting. T selects the next contact, including the moon Lyra. L opens
the local system map; M opens the galaxy map. Select Vesper and choose **Engage hyperdrive**.

No API keys, downloaded models, textures, fonts, or services are required. **No dependencies were added
for Milestone 3.** All celestial definitions, shaders, and synthesized audio are local.

## The charted reaches

| System     | Central star   | Worlds                                                          | Moons              | Arrival          |
| ---------- | -------------- | --------------------------------------------------------------- | ------------------ | ---------------- |
| **Solara** | Warm yellow    | Pelagos (blue terrestrial), Cairn (desert), Aureole (gas giant) | Lyra, Tala         | Pelagos approach |
| **Vesper** | Dim red-orange | Umbra (dark rock), Rime (ice), Nacre (ringed gas giant)         | Mote, Sable, Veil  | Nacre approach   |
| **Aether** | Blue-white     | Pyra (volcanic), Serein (ocean), Prism (unusual ringed giant)   | Cinder, Lilt, Opal | Serein approach  |

Reusable shaders provide ocean/land/cloud patterns, desert strata, icy fractures, volcanic seams,
crater-like variation, and gas bands. Planets have day/night lighting and axial rotation. Optional
Fresnel atmospheres brighten toward the limb; banded translucent rings receive a planet shadow.
System palettes, ambient light, nebula backgrounds, and seeded starfields give each destination its own
appearance. Moons follow deterministic inclined orbits. Planet positions are deliberately fixed.

## Controls

| Input          | Action                                                         |
| -------------- | -------------------------------------------------------------- |
| Mouse movement | Pitch/yaw; steering gently recenters when movement stops       |
| ↑ / ↓          | Nose down/up (inverted pitch)                                  |
| ← / →          | Roll left/right                                                |
| Q / E          | Yaw left/right                                                 |
| W / S          | Increase/decrease throttle                                     |
| Shift          | Hold for engine boost                                          |
| Space          | Hold to brake; stored throttle is preserved                    |
| C              | Switch chase/cockpit camera                                    |
| F              | Toggle flight assistance                                       |
| M              | Open/close galaxy map                                          |
| L              | Open/close local system map                                    |
| T / X          | Cycle/clear local navigation target                            |
| Esc            | Close map, pause flight/release mouse, or abort an active jump |

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

**Controls** opens the briefing. **Reset flight** cancels any pending jump and returns the craft to a
safe arrival in its current system, restoring engine reserve and clearing momentum. Camera and
assistance preferences survive reset. Boost lasts about four seconds, recharges after a delay, and
requires releasing Shift after depletion to rearm at 18% reserve. Assistance damps drift and angular
momentum; without it, use counter-steering or brake.

## Hyperspace

The galaxy map highlights your current system, shows destination details and its arrival anchor, and
requires another system to be selected. Jumping to the current system, uncharted destinations,
overlapping jumps, and jumping during cooldown are unavailable.

| State        | Default duration | Behavior                                                                   |
| ------------ | ---------------- | -------------------------------------------------------------------------- |
| CHARGING     | 2.8 s            | Flight held, engine energy builds, optional synthesized audio cue          |
| ACCELERATING | 1.8 s            | Stars lengthen, tunnel fades in, FOV expands, subtle vibration             |
| HYPERSPACE   | At least 3.2 s   | Opaque procedural tunnel and 650 GPU star streaks mask preparation         |
| EXITING      | 2 s              | Destination activates at a safe arrival, tunnel fades away, camera settles |
| COOLDOWN     | 4 s              | Normal keyboard flight resumes; another jump remains unavailable           |
| IDLE         | —                | Hyperdrive ready                                                           |

Timing lives in `engine/navigation/HyperspaceController.ts`. Visual speed is a presentation effect;
the ship is not accelerated to enormous logical velocities. Arrival stops momentum/throttle and
preserves engine reserve, trip distance, assistance, and camera choice. Keyboard control returns
without another click. Mouse users can pause and select **Resume with mouse** to recapture the pointer
through a user gesture. Jump audio can be disabled in the galaxy map.

Escape or **Abort jump** cancels safely. Before arrival commit, you remain in the source system. After
commit, you remain at the destination's safe arrival. Reset/unmount invalidate pending preparation,
so late results cannot activate a system. A rejected/invalid destination or preparation timeout keeps
the original system and offers normal flight again. Blur/hidden tabs hold an active journey until
**Resume journey** is clicked; a bounded delta prevents suspension from skipping the sequence.

Reduced-motion preferences disable jump vibration, speed/jump FOV changes, tunnel animation, and
visual axial spin. Essential steering, orbital positions, phase progress, and travel remain available.

## Stack and commands

React 19, strict TypeScript 7, Vite 8, Three.js r182, React Three Fiber 9, Drei 10, Zustand 5,
Tailwind CSS 4, Biome 2, and Vitest 5. Resolved versions are in `package-lock.json`. Three is pinned to
r182 because Fiber 9 constructs `Clock`, deprecated in later Three releases; update the matching types
and verify Fiber compatibility before changing that pin.

| Command             | Behavior                                          |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Vite development server                           |
| `npm run build`     | Strict type check and production build to `dist/` |
| `npm run preview`   | Serve the built `dist/` locally                   |
| `npm run lint`      | Biome formatting/import/lint checks               |
| `npm run format`    | Apply formatting, import organization, safe fixes |
| `npm run typecheck` | Check app, tests, Vite configuration              |
| `npm test`          | Run unit tests                                    |
| `npm run check`     | Lint, tests, type-checked production build        |

CI runs npm ci, lint, tests, and build. Hosting is not configured; `dist/` can be served as static
files. No environment file is needed. Future `VITE_` variables are public client configuration, never
secrets.

## Architecture and coordinates

```text
src/engine/
  input/                  Active-flight keyboard and pointer-lock adapter
  simulation/             Fixed-step flight physics and scalar telemetry
  world/                  Serializable definitions, validation, analytical orbits, render origin
  navigation/             Pure target/bearing calculations and hyperspace state machine
src/features/
  exploration/
    data/systems.ts       Handcrafted catalogue and cancellable bundled-definition loader
    ExplorationSession.ts Preparation, jump lifecycle, system commit, navigation publication
    HyperdriveAudio.ts    Gesture-started synthesized cue and cleanup
    components/           Galaxy/local maps, target HUD, journey status
    rendering/            System scene composition and GPU hyperspace effect
  flight/                 Input/session lifetime, interpolation, camera, HUD, tuning
  planets/                Reusable celestial geometry, surface/atmosphere/ring shaders
  spacecraft/             Original Kestrel model, independent of physics
  space/                  Seeded stars, nebula backdrop, periodic dust and approach beacons
src/stores/               Discrete choices and detached read models, published at 10 Hz
```

Logical positions use JavaScript double-precision metres within a system; time is in seconds and
angles in radians. Astronomy is compressed for playable travel times. Local forward is **-Z**, up
**+Y**, right **+X**. A body's position is relative to its parent; moon orbits are evaluated from an
explicit shared simulation time, independently of the order of definitions or frame history.

`FlightController` retains the logical pose. A 1024-metre grid origin near the player converts it into
render space without moving simulation coordinates. The camera translates by each origin change
before applying follow damping. Celestial transforms subtract the same origin; distant bodies are
culled before large transforms reach the GPU. The sky and hyperdrive are camera-relative, and local
dust wraps through a bounded periodic field. HUD distances always use logical coordinates.

Flight remains fixed at **120 Hz**, bounded to **0.1 seconds / 12 catch-up ticks**, with interpolated
presentation. Telemetry/navigation publish at **10 Hz**; idle paused navigation does not republish.
React and stores never own frame-rate transforms. The engine has no React, DOM, feature, store,
renderer, clock, or network dependency. Stable IDs, explicit system time, analytical orbits, and
logical coordinates prepare the boundary for future networking; they do not implement it.

See [architecture and extension guide](docs/architecture.md), including how to add a system or moon.

## Verification and limitations

Automated tests cover flight/input behavior plus definitions, invalid parents/cycles/duplicates,
orbits, coordinate round-trips/rebases, target selection/bearings/distances, safe arrival selection,
all jump phases, invalid destinations, cancellation, async failure/late completion, timeout,
focus/visibility, reset/disposal, camera independence, arrival state, and keyboard restoration.

Browser playtesting covers launching in Solara, tracking/flying toward Lyra, both maps, the
Solara → Vesper → Aether → Solara journey, cockpit/chase modes, input suppression and re-entry,
responsive layouts, and browser console checks. Unit tests cannot certify GPU behavior or native
pointer-lock support. Pointer capture still needs wider manual hardware/browser testing if an
embedded or automated browser rejects it.

- Arcade flight and compressed distances; no gravity, collisions, damage, terrain or landing. Bodies
  and beacons are visual references and can be flown through.
- Bundled procedural systems are prepared in memory; there is no network asset streaming or save-game
  persistence. Reloading starts in Solara. There is no touch/gamepad piloting.
- One synthesized hyperdrive cue, not a complete soundscape. No audio assets or post-processing stack.
- Rendering continues while paused. Pixel ratio is bounded; geometry, buffers, and scratch vectors
  are reused. Approximately 60 FPS is a target, not a guarantee across hardware. Wider profiling and
  adaptive quality/LOD remain future work.
- Vite retains its large-chunk advisory for Three.js application/scene bundles. Unsupported WebGL
  browsers receive a fallback; automatic graphics-context recovery is not implemented.
- No server authority, state synchronization, prediction/reconciliation, or cross-platform bitwise
  determinism is implemented.

## Roadmap

- [x] Milestone 1 — Typed foundation, modular renderer, tooling, CI
- [x] Milestone 2 — Inertial flight, boost/assistance, cameras, original spacecraft, HUD
- [x] Milestone 3 — Three systems, procedural celestial bodies, orbital moons, navigation/maps,
  floating origin, cinematic hyperspace, safe transitions
- [ ] Milestone 4 — **Space Combat & PvE**: targeting/combat rules, weapons, damage, first enemy encounters
- [ ] Milestone 5 — Multiplayer PvP and authoritative synchronization
- [ ] Later — Terrain/landings, wider hardware support, richer audio and quality settings

Licensed under [MIT](LICENSE).
