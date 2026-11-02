# Milestone 4 — Combat & PvE consolidation

Authoritative single-player target established on 2026-11-01. The next milestone is **Multiplayer
PvP & Cooperative PvE**. Networking, progression, complex missions, detailed terrain and landings
are outside this milestone.

Later iterations are recorded separately: [Travel/Combat controls](flight-modes.md) and
[hyperspace safety, pacing and guidance](hyperspace.md). The acceptance figures below remain the
historical Milestone 4 run.

## Audit and implementation outcome

The repository already contained shared player/NPC flight, four weapons, relative sphere sweeps,
health/regeneration, target cycling/leading, five-ship opt-in patrols, manual player respawn, models,
instanced effects, synthesized/spatial audio, three systems and masked hyperspace. Those systems
were retained. Baseline `npm run check` passed 272 tests before changes.

Consolidation added cannon heat/hysteresis, configurable alternating/synchronized hardpoints and
relative range/velocity inheritance, nearest-ahead/clear targeting, left-mouse fire, timed automatic
patrols and safe enemy respawn, reaction-limited AI with seeded error/retreat, attributed gameplay
events and detached JSON snapshots. It also fixed an expired linear intercept, stale-object damage
after slot reuse, focus-sensitive Escape, close-range AI circling, missing no-solution lead handling,
and combat/planet-label overlap in compact viewports. Existing four-weapon behavior remains covered.

## Acceptance record

| Specification area              | Implemented ownership and evidence                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Repository inspection        | Existing README, AGENTS, architecture, simulation/input/world/journey/render/audio and tests audited; existing spacecraft work preserved.                                                                                                     |
| 2. Combat architecture          | `engine/combat` owns fixed-tick ships, commands, weapons, health, targeting, AI, events and encounter schedule. `CombatSession` adapts the world/UI/audio.                                                                                    |
| 3. Laser cannons                | Configured hardpoints, modes, fire rate, damage/speed/range/lifetime, inherited velocity, heat lockout and cooling. `weapons.test.ts` covers rate, range, emission and heat recovery.                                                         |
| 4. Collisions                   | Relative swept spheres, nearest solid contact, entity/team filtering, physical ship contacts and bounded response. `combat.test.ts` covers fast/moving contacts and all-weapon friendly filtering.                                            |
| 5. Defenses/destruction/respawn | Central shield-first damage, delayed regeneration, single destruction event, timed protected NPC replacement and explicit protected player respawn. Damage/lifecycle tests cover both.                                                        |
| 6. Targeting                    | G acquires ahead, N/Tab cycles, H clears. Names, distance, defenses, off-axis/aft brackets and valid intercept cues work in both cameras. Pure selection/intercept tests and browser play.                                                    |
| 7. AI                           | Patrol/pursue/attack/evade/retreat/disengage/destroyed, seeded aim error, reaction timers and difficulty parameters. Shared controller limits speed, acceleration and quaternion turning. Transition/replay/dogfight tests.                   |
| 8. Encounters                   | Five enemies by default, configurable clear spawn search, eight-second arrival delay, 12-second replacement and stable system-scoped slot IDs. Retry/cancel/cap tests and safe all-system respawn tests.                                      |
| 9. Spacecraft                   | Bundled CC0 player/enemy hulls remain distinct, with shared geometry/material lifetime, lamps/plumes and configured weapon origins. Asset/resource tests retained.                                                                            |
| 10. HUD                         | Shield/hull, heat/overheat, damage, named target/range/defenses, reticle/lead, kills and reinforcement timing at 10 Hz. Compact portrait/short viewport checks.                                                                               |
| 11. Controls                    | Existing flight/navigation bindings preserved. Mouse/Space fire, G/H acquire/clear, N/Tab cycle. Pause/maps/jumps/focus clear or suppress inputs; Escape remains active with buttons focused. Adapter tests.                                  |
| 12. Effects/audio               | Bright bolts/halos/trails/muzzle flashes, shield flashes, sparks, expanding shells and short debris. Original optional synthesis and bounded spatial engines retained; lifetime/audio tests.                                                  |
| 13. System integration          | Logical world positions drive collisions/selection; effects subtract render origin. Departure clears entities/projectiles/targets/events/timers, arrival safely rebuilds colliders and patrol schedule. All-system tests and browser journey. |
| 14. Future authority            | Stable IDs, detached JSON flight/combat/encounter snapshots, explicit source-attributed events and shared commands. No React/DOM/stores/renderer/clocks in gameplay. Snapshot/replay/stale-identity tests.                                    |
| 15. Performance                 | Ten-NPC/192-projectile/32-trace/96-effect/128-event caps, bounded instancing, 0.15 s AI decisions, 10 Hz readouts and resource cleanup. Existing sustained/replay/resource tests. No broad GPU benchmark claimed.                             |
| 16. Tests                       | 295 behavioral tests in 28 files, including weapon rates/heat, motion/expiry/range, sweeps/filtering, damage/regen, selection/intercepts, AI constraints, respawn, input and hyperspace cleanup.                                              |
| 17. Documentation               | README, AGENTS and architecture updated. Architecture includes weapon and enemy extension instructions. This record defines consolidated acceptance and verification limits.                                                                  |
| 18. Verification                | TypeScript, Biome, all tests and production build executed successfully; browser checks listed below.                                                                                                                                         |

## Verification performed

- `npm run typecheck`: passed.
- `npm run lint`: passed without findings.
- `npm test`: 295 tests passed, 28 files.
- `npm run build`: passed. Vite retains its existing advisory about chunks above 500 kB.
- `npm run check`: passed (lint, tests and a type-checked production build).
- Browser: practice kills in Solara, Vesper and Aether; held keyboard fire and held left-mouse fire;
  heat/overheat feedback; live moving-patrol missile kills; incoming shield/hull damage; player death
  and protected manual respawn; chase/cockpit views; both maps, focus traversal, Escape, abort/reset; the full
  Solara → Vesper → Aether → Solara journey and an opaque tunnel with foreground ship visible.
- Browser: 390 × 844 and 390 × 600 layouts inspected. Combat instruments remain legible; planetary
  edge labels reserve the instrument area and hide when it has no remaining space.
- Browser console inspection returned no warnings/errors. Native mouse capture was rejected by the
  embedded browser; keyboard flight resumed successfully and left-mouse fire worked without capture.

## Deliberate limits and next steps

Player death pauses gameplay and requires a respawn gesture; enemy respawn uses configurable active
simulation time. Practice remains a finite alternative to the replenishing patrol. Rings/atmospheres
are visual boundaries for combat; hyperspace clearance still includes their envelopes. Collision
volumes remain conservative spheres, and AI remains lightweight steering with constant-velocity aim.

Enemy replacement/protection and shield regeneration timing are covered headlessly; this run did not
manually observe every such boundary in the browser. Native pointer-lock feel, audio perception,
reduced-motion preference on real hardware and a formal 60 FPS GPU benchmark require broader manual
coverage. These are verification limits, not claims of missing implementations.

Before multiplayer: define validated/versioned snapshot import and tick transport; validate/rate-limit
commands; assign server authority to spawn/orbit/damage decisions; implement prediction/reconciliation
and lag compensation; add latency, disconnect, replay and cross-platform determinism coverage.
Snapshots/events are local export contracts, not an implemented network protocol or persistent save.
