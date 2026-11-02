# Event Horizon

A browser-based space flight, exploration, and PvE combat game, built one system at a time.

**Milestones 6 & 7 — Galaxy Expansion, Planetary Exploration & Docking.** Explore ten distinct
systems, 49 landable solid worlds/moons and 45 settlements. Descend through shared atmospheres,
find capitals and regional cities, request an exclusive surface pad, repair, and return to orbit.
Deterministic terrain, oceans, climates/weather, civilization metadata, city layouts, planetary maps
and bounded ambient traffic extend the existing flight, combat, gravity and multiplayer authority.
Solara Orbital's hangar, Vesper Outpost, both cameras and cinematic hyperspace remain supported.

See the [expanded galaxy, architecture, examples and verification record](docs/galaxy-expansion.md),
[planetary flight and docking guide](docs/planetary-exploration.md) and
[original Milestones 6–7 acceptance record](docs/milestones-6-7.md). No dependencies were added.
The next planned milestone is Missions, Contracts & Player Progression.

## Start multiplayer

```bash
npm ci
npm run server  # terminal one, default ws://127.0.0.1:43172
npm run dev     # terminal two, http://127.0.0.1:43170
```

Open the Vite URL in two tabs/windows, enter callsigns, choose **Connect multiplayer**, then
**Keyboard flight**. Guests in the same public system instance share PvP and AI encounters.
Menus release controls while the server keeps simulating; other ships can still damage you.
Use the galaxy map for authoritative cinematic transfers between rooms. Reconnection restores a
guest within the default 15-second grace; expired guests cleanly rejoin with a new identity.

Optional settings are listed in `.env.example`. `VITE_MULTIPLAYER_URL` is the public endpoint;
Node settings control host/port, tick/snapshot rates, capacity, relevance and reconnection grace.
When overriding `SERVER_PORT` in `.env`, update `VITE_MULTIPLAYER_URL` to the matching address and
restart the server and Vite. Existing `.env` files may still contain the previous port `2567`.
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

Open Vite's printed Local URL (default `http://127.0.0.1:43170`). Choose **Keyboard flight** or **Fly
with mouse**. You start stationary near Pelagos in Solara, near its orbital station, 22 km above the reference surface. Hold W to raise
throttle gradually from 0% to 100%; release W to ease back toward a stop. Hold S for stronger braking.
T selects the next contact, including the moon Lyra. L opens
the local system map; M opens the galaxy map. Select Vesper and choose **Engage hyperdrive**.

No API keys, external services, or separate asset downloads are required. **No dependencies were added
for Milestones 3 or 4.** All celestial definitions, shaders, audio, and interface assets are local.

Local ports are `43170` for development, `43171` for `npm run preview` after a build, and `43172`
for the multiplayer authority. Vite exits if its selected port is occupied. To choose another web
port, use `npm run dev -- --port 43270` or `npm run preview -- --port 43271`.

The Kestrel uses Quaternius's blue **Spitfire** hull; patrols mix red **Striker** and **Insurgent**
hulls, each with its own engine mounts. Three bundled GLBs share geometry/materials across enemies
and total about 1.6 MB, including 1024px textures. Their silhouettes fit the existing collision spheres;
flight handling, weapons and damage rules are unchanged. The cockpit remains the original procedural
flight deck. See [CREDITS.md](CREDITS.md) for the CC0 release, source mirror and asset preparation recipe.

Blue engine fire has pale hot cores, tapered cobalt tongues and a wispy blue exhaust trail. Steady
nose, wing and dorsal running lights, colored light spill and a restrained hull rim keep ships visible against dark space,
including approaching enemies; running lamps retain cyan player / amber enemy colors. Flame length,
brightness, ion particles and the wake grow with throttle and boost. Effects pause with flight;
reduced motion retains steady lights and flame shapes while suppressing flame animation, particles
and the wake. Lights remain occluded by solid objects, and their small distant glow stays readable at combat ranges.

The interface is a 1980s flight terminal: green phosphor displays, amber seven-segment speed
and heading readouts, segmented engine gauges, a bearing scope, and a wireframe Kestrel schematic.
Flight instruments float over the scene with short reference rules, slim gauges, and a quiet header;
the briefing, survey charts, and warnings retain framed terminal panels. Controls share visible
keyboard focus. The header FPS counter shows rendered frames per second, averaged and refreshed
every half second, in both offline and multiplayer flight. Green ACCEL and amber DECEL lamps blink
with actual speed changes, including in reverse; directional chevrons, a speed tape, engine gauge
cursors and a flight-status pulse animate
the live instruments. Speed trends use the existing 10 Hz telemetry cadence, settle at steady speed,
and clear on pause. Reduced motion keeps lamps steady and removes animation/transitions. A static
CRT texture adds scanlines without flicker or animation. The bundled
Share Tech Mono font is distributed under the SIL Open Font License; see
[`public/assets/fonts/OFL-ShareTechMono.txt`](public/assets/fonts/OFL-ShareTechMono.txt).

## The charted reaches

| System       | Central star   | Worlds                                                          | Moons              | Arrival           |
| ------------ | -------------- | --------------------------------------------------------------- | ------------------ | ----------------- |
| **Solara**   | Warm yellow    | Pelagos (blue terrestrial), Cairn (desert), Aureole (gas giant) | Lyra, Tala         | Pelagos approach  |
| **Vesper**   | Dim red-orange | Umbra (dark rock), Rime (ice), Nacre (ringed gas giant)         | Mote, Sable, Veil  | Nacre approach    |
| **Aether**   | Blue-white     | Pyra (volcanic), Serein (ocean), Prism (unusual ringed giant)   | Cinder, Lilt, Opal | Serein approach   |
| **Meridian** | Warm white     | Concord (urban temperate), Brass (desert), Regent (giant)       | Three survey moons | Concord approach  |
| **Kharon**   | Orange         | Sirocco (desert colony), Slag (mining), Ochre (giant)           | Three survey moons | Sirocco approach  |
| **Nivalis**  | White-blue     | Boreal, Hoarfrost (frozen), Pallor (giant)                      | Three survey moons | Boreal approach   |
| **Pelagia**  | Warm yellow    | Thalassa (ocean), Verdant (agriculture), Gyre (giant)           | Three survey moons | Thalassa approach |
| **Ignis**    | Orange-red     | Forge, Scoria (volcanic), Furnace (giant)                       | Three survey moons | Forge approach    |
| **Elysion**  | Pale yellow    | Elysium (developed temperate), Haven (ocean), Pastel (giant)    | Three survey moons | Elysium approach  |
| **Umbra**    | Violet-white   | Noctis (barren), Hush (frozen), Penumbra (giant)                | Three survey moons | Noctis approach   |

Reusable shaders provide ocean/land/cloud patterns, desert strata, icy fractures, volcanic seams,
crater-like variation, and gas bands. Planets have day/night lighting and axial rotation. Optional
Fresnel atmospheres brighten toward the limb; banded translucent rings receive a planet shadow.
System palettes, ambient light and seeded nebula backgrounds give each destination its own
appearance. A shared distant starfield preserves the galactic sky across journeys. Moons follow
deterministic inclined orbits. Planet positions are deliberately fixed.

## Procedural planetary visuals

A shared seeded surface field now drives continental shelves, ridge belts, valleys, craters, biome
blends and worker-baked orbital maps. Pelagos' reference region connects ocean coast, forested
lowlands and Western Ridge to Port Helios. Existing named settlements, survey bases, pads and
arrival anchors retain their positions. Desert, oceanic, frozen, volcanic and barren worlds use the
same bounded pipeline with distinct landforms and palettes.

Nearby forests and rock clusters stream in small cells; distant canopy stays in surface shading.
Compact cities assemble six building families into civic, residential, industrial, research and
spaceport districts. Modular buildings share their recipes with authoritative collision boxes.
Water normals, cloud patterns and atmospheric sky fill remain lightweight approximations.

Terrain remains limited to 150 leaves with a 384-patch hard cache ceiling. Two scene-owned workers
prioritize terrain over decorative generation; only the nearest city streams up to 16 detailed
blocks. Scenery has a 4,096-instance ceiling (the current kit allocates 3,072 slots). DPR remains
capped at 1.5. See [generation, budgets and verification](docs/planetary-visual-generation.md).

**Multiplayer now uses protocol v6. Restart the authority and reload clients together.** Previous
clients are rejected because their generated terrain and building collision geometry differ.
No terrain meshes or decorative scenery are sent over the network. Vegetation and small rocks are
visual scenery; they do not add flight collisions. Buildings and terrain remain authoritative.

## Controls

| Input              | Action                                                           |
| ------------------ | ---------------------------------------------------------------- |
| Mouse movement     | Pitch/yaw; steering gently recenters when movement stops         |
| ↑ / ↓              | Nose down/up (inverted pitch)                                    |
| ← / →              | Roll left/right                                                  |
| Q / E              | Yaw left/right                                                   |
| W                  | Gradually raise throttle to 100%; release to slow down           |
| S                  | Brake; keep holding to reverse once throttle reaches zero        |
| Shift              | Hold for engine boost                                            |
| A / D              | Strafe left/right in the ship’s local frame                      |
| Left mouse / Space | Hold to fire the selected weapon                                 |
| 1 / 2 / 3 / 4      | Select gun / homing missiles / railgun / flak scattergun         |
| B                  | Start a five-ship patrol encounter when the sector is clear      |
| G                  | Auto land/dock/takeoff/undock; press again to cancel approach    |
| N                  | Cycle nearby hostile targets in Combat                           |
| Tab                | Confirm suggested target, docking, landing, takeoff or undocking |
| C                  | Switch chase/cockpit camera                                      |
| F                  | Switch stabilized Travel / Combat                                |
| M                  | Open/close galaxy map                                            |
| L                  | Open/close local system map                                      |
| T / X              | Cycle navigation / clear navigation and combat target            |
| Esc                | Close map, pause flight/release mouse, or abort an active jump   |

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

While flying, edge arrows identify up to three off-screen planets within **300 km of their surface**.
Each shows its name and surface distance; **AFT** marks a planet behind the camera. The selected
planet is amber, and other nearby planets use phosphor green. Arrows follow the actual chase/cockpit
view, stay clear of the compass and instrument bank, and separate nearby labels. Crowded compact
layouts prioritize the nearest planets. Stars and moons retain normal target selection. These edge
markers hide while paused, in maps, during hyperspace, or when the combat instruments leave no room. Range and count are tunable in
`features/flight/config.ts`.

**Controls** opens the briefing. **Reset flight** cancels any pending jump and returns the craft to a
safe arrival in its current system, restoring engine reserve and clearing momentum. Camera and
flight-mode preferences survive reset. F switches between stabilized **Travel** and **Combat**.
Travel provides the fastest speed with weapons and shields offline and no energy consumption;
the hull remains vulnerable. Combat enables weapons and shields at 180 m/s cruise / 360 m/s boost.
Weapons, shields and boost use one rechargeable ENERGY reserve. Mode switches clear held fire and
weapon charge, preserve shield charge and brake excess travel speed before weapons unlock.
Both modes retain gravity compensation and drift/angular damping. Tab confirms the HUD's contextual
suggestion: acquire/cycle a combat target, select a destination, start/cancel automatic docking,
start/cancel landing, take off or undock. Tab keeps normal focus navigation inside
maps and from focused controls. See [flight modes, contextual actions and energy](docs/flight-modes.md).
Releasing W gradually lowers throttle; S brakes, then reverses at zero throttle. Release S to slow
reverse movement, or hold W to accelerate forward again. Shift with W boosts; only Combat drains
energy, and depleted combat boost requires releasing Shift before rearming at 18% reserve.

## Planetary flight and docking

Start in Solara, use L, T or Tab to select **Pelagos Survey Base** or **Solara Orbital**.
Travel automatically engages clear-space speed and terrain-aware planetary approach up to 1.4 km/s,
braking near terrain, stations and traffic. The separate O approach/transit toggle is removed.
**G / Gear** selects a nearby free berth or suitable landing zone and performs the complete
procedure in either flight mode. The HUD previews the action: land, dock, take off, undock or cancel.
R/V vertical thrust and K/U/P/I/J procedure shortcuts are retired. Pitch up to climb in ordinary
flight; G provides the initial lift from the ground. A/D retain horizontal strafe.

For landing, slow below 150 m/s, fly below 2.5 km altitude and within 1 km horizontally of a landing
zone, release movement controls and press G. A valid selected zone takes priority over the nearest
zone. Gear deploys automatically, the ship levels, settles drift and descends continuously. Landing
still requires safe vertical/ground speed, attitude, slope and traffic clearance. G starts powered
takeoff once landed and retracts gear when clear. Landings use authored/generated landing zones;
G does not create a pad on arbitrary terrain. Descent ETA is approximate.

For docking, slow below 150 m/s and approach within 2.5 km of a free berth's approach marker, then
press G. Nearby berths take priority over surface landing zones. The authority chooses the nearest
free berth with a clear approach, guides through its approach marker, aligns and captures it. Terrain,
station hulls and nearby ships are swept on every guided segment. A new obstruction cancels the
approach. G, manual movement, F or pause/maps cancel unfinished approaches; resuming does not
restart them. The existing zone/port intentions remain validated offline and on the server.

Docked services repair hull, recharge shields
and cool weapons for free; firing and flight input are locked. G undocks once the corridor is clear. See [contextual gear and verification](docs/gear-controls.md).
Landing/docking preserve damage; services update authoritative state. Other guests see shared port
occupancy. Menus keep the server running. Planetary and docking instruments publish at 10 Hz.

All solid planets and moons are landable on suitable dry terrain. Gas giants, stars and liquid
surfaces reject landing. **Y** opens the planetary survey with capitals, regional cities, outposts,
spaceports, landmarks and restricted areas; use **Target spaceport** to request clearance nearby.
City pads use the same capture envelope, exclusive leases and services as orbital docking.
Weather/winds derive from shared seeds and simulation time; nearby non-firing courier traffic uses
shared authority. There are no walking characters, ground population simulation, economy or inventory.
City architecture is stylized, roads are selective, and weather/scattering are approximate. See the
[expansion guide and explicit verification limits](docs/galaxy-expansion.md). Guests remain in memory.

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
player respawn clear it. The HUD displays heat, overheat, and incoming damage. Friendly fire is disabled offline; multiplayer enables PvP. Ships, asteroids and non-landable celestial bodies use solid spheres; landable worlds use terrain sweeps and stations use oriented box sweeps; lasers stop at the first solid
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

Select another system in the galaxy map. The chart shows route distance in light years and estimated
jump time. Current-system, overlapping and cooldown requests remain unavailable.

| State        | Duration                  | Behavior                                                              |
| ------------ | ------------------------- | --------------------------------------------------------------------- |
| CHARGING     | 3.2 s                     | Align, bank, level out and charge                                     |
| ACCELERATING | 3.4 s                     | Stretch with forward creep, then a visible surge and cloud crossing   |
| HYPERSPACE   | 3.4 s + 0.12 s/light year | Distance-scaled transit under the opaque blue corridor                |
| EXITING      | 4.114 s                   | Brief flash, then 3.4 s of star beams with a coordinated braking beat |
| COOLDOWN     | 4 s                       | Keyboard flight resumes at 100 m/s; hyperdrive recharges              |
| IDLE         | —                         | Ready for another course                                              |

Galactic coordinates supply both headings and light-year distances. Longer routes take longer; ETA
includes charge, entry, transit and exit, excluding cooldown. Destination preparation or readiness
can extend it. A live hyperspace-lane map replaces the telemetry panel, showing departure and
destination, nearby systems, range rings and the Kestrel's position along the active lane. The marker
advances with actual light-year distance at the existing 10 Hz telemetry cadence; charging stays at
departure. Distance and arrival ETA remain below the map, with **Abort / Esc** alongside it. The map
sits at the lower right on wide screens and becomes compact on narrow screens. Arrival waits show
**HOLD**; focus/visibility suspension freezes the map and clocks until **Resume journey**.

A blocked departure returns to keyboard flight with an amber escape waypoint and distance instead
of stopping at an error. Follow the shortest tested safe local route; guidance never steers the ship.
Once the current lane clears, press **Tab** or **Engage** to confirm. There is no expiring quick-time
window. The course remains selected and launch clearance is checked again before charging and network
authorization. Narrow screens use a compact bearing banner above the hull and altitude instruments.

Clearance covers the entire bounded departure and arrival coast, including the lead-in behind the
multiplayer holding point and occupied-spawn offsets. Terrain, engineered foundations, physical
atmospheres, rings, ancestor orbital motion and moving/rotating facilities contribute conservative
bounds. Source checks cover transit/preparation waits; receiver checks also cover the remaining
transit before the destination scene becomes visible. No hyperspeed enters normal flight physics.

The ship covers 1,800 km in real space with a small forward creep and heavy eighth-power entry ease-in. Charge selects a
clear launch bearing beside obstructing bodies; the galactic arrival bearing settles under the
opaque tunnel. Arrival coasts at 800 km/s through the reveal, then brakes with a heavy ease-out
once the mask is gone, handing control back at 100 m/s. The roughly 964 km incoming path ends
near the destination planet, so bodies grow and sweep past as the ship slows.

The persistent 12,000-star field produces broader white/cyan optical trails. Full stretch remains
visible for about 0.75 seconds before tunnel coverage begins. The longer buildup keeps the stars
growing while the ship starts moving; over 60% of the departure distance is covered before the cloud
blend reaches half coverage. The beams widen and brighten into a brief white flash, revealing
layered blue clouds with dark folds, fine luminous wisps and pulsing light pools. No star beams
remain inside the tunnel. Clouds rush outward from
the vanishing point toward the ship, with shearing layers around an 11-degree-per-second clockwise swirl.
A broad drifting blue light casts soft shadows across the player hull and cockpit, synchronized with the
bright tunnel walls.
Exit blooms the tunnel light into a second white flash, recovers the fully glowing star streaks,
then opens the destination from the center over
roughly 0.38 seconds. Star heads stay fixed on the galactic sky. Braking, trail contraction,
engine release and the camera/audio impulse share one arrival beat, followed by a smooth settle.
After the brief exit flash clears, the star-beam animation runs for 3.4 seconds, matching entry.
Short, occasional camera/tunnel hiccups interrupt otherwise steady cruise, with seeded timing and
at least two seconds of complete rest between them. Reflected light varies independently; neither
effect changes the ship's physical trajectory. Hull/cockpit/exhaust keep foreground depth;
the brief crossing flashes overexpose the complete scene.
Reduced-motion preferences
suppress trails, turbulence, recoil, animated clouds/light, exposure and dynamic FOV.

Arrival preserves damage, energy, trip distance, flight mode and camera preference, then restores
keyboard flight at a controlled 100 m/s. Hold W to accelerate; otherwise the ship gradually slows.
Mouse capture still requires a user gesture. Escape or the HUD's **Abort / Esc** button cancels safely:
before destination admission/activation the source remains active; after multiplayer admission or
offline commit the destination remains active. Reset/unmount invalidate asynchronous work; late
results cannot resurrect cancelled journeys. The matching
arrival scene must report its first frame before the tunnel can reveal it.

Optional CC0 machinery recordings and synthesized fallback audio remain independent of gameplay
clocks. Crossing cues follow the late departure burst and the arrival braking beat. Sound controls and source credits remain in the
galaxy map and [CREDITS.md](CREDITS.md).

See [hyperspace controls, safety details and verification](docs/hyperspace.md).

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
  planetary/              Shared terrain queries, reference frames, gravity and flight tuning
  stations/               Definitions, oriented sweeps, exclusive docking and services
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
  planets/                Worker terrain LOD, atmospheres, landing presentation and telemetry
  stations/               Modular facilities and docking guidance
  spacecraft/             Original Kestrel model, independent of physics
  space/                  Seeded stars, nebula backdrop, periodic dust and approach beacons
server/                   Colyseus system rooms, guest/travel lifecycle and fixed authority loop
scripts/loadTest.ts       Real-client load and bandwidth measurements
src/stores/               Discrete choices and detached read models, published at 10 Hz
```

Logical positions use JavaScript double-precision metres within a system; time is in seconds and
angles in radians. Astronomy uses gameplay scaling: 138–405 km planets and 25.5–54 km moons. Local forward is **-Z**, up
**+Y**, right **+X**. A body's position is relative to its parent; moon orbits are evaluated from an
explicit shared simulation time, independently of the order of definitions or frame history.

`FlightController` retains the normal-flight logical pose; a bounded analytical journey supplies the
presented pose during jumps. A 1024-metre grid origin near the player converts that pose into
render space without moving simulation coordinates. The camera follows ship translation immediately at any speed and translates by each origin change
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

The [hyperspace iteration](docs/hyperspace.md) records the current 583-test run, browser journey,
launch-guidance and tunnel-lighting checks, a 60-second renderer sample, and earlier short
2/8/16-client measurements with explicit verification limits.

The [2 November expansion record](docs/galaxy-expansion.md#verification-and-measurements) documents
499 tests, two-browser capital services/occupancy, expanded real-socket transfers, load measurements
and the limits of those checks. The earlier evidence below refers to its original build.

The [planetary approach record](docs/planetary-approach.md) covers current pacing, controls and checks.
[Milestones 6–7 acceptance](docs/milestones-6-7.md) retains the original implementation evidence.
Historical evidence below remains dated to its run.

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
and the production build. Earlier browser playtesting covered practice kills in the original three systems, keyboard
and left-mouse fire, overheat feedback, live patrol kills, incoming damage, player destruction/respawn,
chase/cockpit cameras, maps, the complete Solara → Vesper → Aether → Solara journey and the opaque
tunnel mask. Compact 390 × 844 and 390 × 600 layouts were inspected and instrument overlap corrected.
Console inspection returned no warnings/errors. The embedded browser rejected pointer capture;
keyboard flight resumed successfully. Native mouse capture, audio perception, reduced-motion hardware
coverage and formal GPU frame-time profiling remain manual verification limits. Enemy replacement
and exact regeneration timing are covered by headless tests. See the
[dated acceptance record](docs/milestone-4.md) for ownership, evidence and remaining verification limits.

- Arcade flight with gravity, atmospheric handling and one landable reference world. Spherical colliders are
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
  adaptive quality remain future work; terrain LOD is bounded and worker-generated.
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
- [x] Milestone 6 — Planetary scale, atmospheric entry/flight, terrain LOD, gravity, landing/takeoff
- [x] Milestone 7 — Orbital hangar, authoritative docking/services, ten-system expansion,
  deterministic archetypes, settlements/capitals, city LOD, surface spaceports, planetary maps and traffic
  (full continuous manual acceptance and broader profiling remain outstanding)
- [ ] Next — Missions, Contracts & Player Progression
- [ ] Later — Larger battles, squadrons, persistent progression, wider hardware support

Licensed under [MIT](LICENSE).
