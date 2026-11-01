# Milestone 5 acceptance and verification — 2026-11-01

The authoritative target is small-session multiplayer PvP/cooperative PvE, with the existing offline
flight/exploration/combat retained. The audit found no existing networking stack. The implementation
reuses flight integration, continuous sphere sweeps, all four weapons, shields/hull, AI steering,
encounter scheduling, analytical celestial state, shared spacecraft resources, floating origin,
charts/cameras and the masked hyperspace transaction. Renderer-independent math replaced Three.js
inside the authoritative import graph; feature config/catalogue exports preserve existing callers.

See [architecture, setup, protocol and limits](multiplayer.md). No accounts, persistence, economy,
terrain, landings or distributed infrastructure were added.

## Executed automated verification

- `npm run check`: Biome, **316 tests across 31 files**, strict TypeScript checks for client/server,
  scripts and tests, and production Vite build.
- `npm run test:integration`: a real listening Colyseus server and SDK clients, without WebGL.
- `npm run test:load`: 2, 8 and 16 simulated clients in one shared room, ten seconds per population.
- `LOAD_LATENCY_MS=75 npm run test:load`: the same populations with 75 ms artificial input delay and
  another 75 ms snapshot delivery delay.

Unit/adapter coverage includes renderer-independent math parity and alias safety, full flight-state
restore, bounded input sequencing/rates and malformed commands, delayed prediction/replay, snapshot
buffering/extrapolation/teleports, neutral pause input, 10 Hz readouts, stale weapon snapshot races,
correct practice defenses, destroyed target removal, nearest-live-player AI selection, relevance
filtering, roster cleanup, flight reserve preservation, safe occupied-arrival release, pending travel
approval cancellation/destination locking and focus suspension. The original offline behavioral tests
continue passing.

Real-protocol tests join two guests, fill a room and create an isolated overflow instance, reject a
forged position, fire authoritative lasers, destroy/respawn a player, share a practice enemy, confirm
both pilots deal damage and receive one enemy destruction, transfer one pilot to Vesper while the
other remains in Solara, then transfer the partner into the same Vesper room. They reject reused
travel/reconnect tokens, recover a dropped session, cancel a transfer, expire a dropped guest, dispose
the empty room and verify a clean fresh join. Source ships/projectiles and destination state remain
server owned throughout.

## Browser exercise

Two independent browser tabs ran the game against the local authority. Across the playtesting runs:

1. Alpha and Bravo joined Solara together; both could move independently and remote hulls/name
   markers updated. Keyboard thrust/strafe/braking and chase/cockpit camera changes worked.
2. Alpha used G and held Space to destroy Bravo. Both received the resulting health/death/statistics;
   Bravo respawned through the server and keyboard control returned.
3. A shared stationary enemy appeared for both pilots. Alpha and Bravo fired at the same enemy;
   both target readouts reflected damage, the enemy disappeared on both clients and Bravo received
   the final kill. This also exposed and corrected the practice archetype health scale.
4. Alpha requested Vesper through the galaxy chart and completed the cinematic/opaque handoff with
   health retained and keyboard flight restored. Bravo remained in Solara, then jumped to Vesper;
   both appeared in the same destination instance. Menus stayed available and normal steering was
   suppressed during the journey.
5. Reload/reconnect restored Bravo's Vesper guest and death count. Explicit disconnect and respawn
   were exercised, including the death-screen disconnect control. Server restarts also exercised
   expired identity/fresh-join recovery. No stale old-system contacts appeared after transfer.
6. Browser warning/error log inspection returned no warnings or errors during the multiplayer
   flight/travel/combat checks. WebGL scenes, shared hulls, engine effects and the terminal HUD were
   visible in screenshots.

The desktop views were inspected at the actual embedded-browser sizes (1043×1193 and 1280×720).
A requested 390×844 viewport override had no effect: DOM measurements remained desktop sized.
**Narrow-viewport verification for this milestone remains unexecuted.** The responsive styles remain,
and Milestone 4's historical mobile-layout record is not treated as new evidence. Native pointer
capture, perceived audio quality, a video/frame-time assessment of interpolation, reduced-motion
hardware coverage, real WAN jitter/loss and long-duration reconnect/transfer soak testing remain
manual verification limits. The 75 ms harness is a controlled local impairment, not a WAN test.

## Load results

Node v22.20.0 on macOS, one process containing both server and bots, default 30 Hz authority /
20 Hz snapshots, five AI enemies and continuous player laser fire. The harness asserts that clients
share a single room. CPU is percent of one core for the combined process; RSS includes bots, caches
and garbage collection. Binary payload sizes exclude WebSocket/TCP headers. Input acknowledgement
latency includes the simulated delays. Each row is a short ten-second run, not a capacity guarantee.

| Network        | Players | Tick Hz | Mean / max tick ms | CPU   | RSS MiB | Mean binary bytes | Down / up KiB/s per client | p95 input ack ms | Overruns |
| -------------- | ------- | ------- | ------------------ | ----- | ------- | ----------------- | -------------------------- | ---------------- | -------- |
| Local          | 2       | 30      | 0.757 / 4.82       | 7.8%  | 138.3   | 5345              | 104.9 / 4.4                | 25               | 0        |
| Local          | 8       | 29.9    | 1.854 / 4.77       | 15.7% | 156     | 12982             | 254.8 / 4.4                | 36               | 0        |
| Local          | 16      | 30      | 3.594 / 19.60      | 23.4% | 175.2   | 21935             | 430.6 / 4.4                | 46               | 0        |
| 75 ms each way | 2       | 30      | 0.666 / 2.82       | 9.4%  | 108     | 5322              | 104.5 / 4.4                | 183              | 0        |
| 75 ms each way | 8       | 29.9    | 1.514 / 12.34      | 16.4% | 153.7   | 12923             | 252.4 / 4.4                | 186              | 0        |
| 75 ms each way | 16      | 29.99   | 3.441 / 63.65      | 25.7% | 222     | 21784             | 427.4 / 4.3                | 218              | 1        |

[Raw results](benchmarks/multiplayer-2026-11-01.json) also record JSON snapshot mean/p95 sizes and RSS
deltas. The measured tick budget stayed below 33.3 ms without overruns for all populations. Nearby
combat snapshot bandwidth is the main measured scaling concern; 16 players can exceed 400 KiB/s
per client. No support for 1,000 concurrent players is claimed. Delta/archetype packing, stronger
interest filtering and longer separate-process/WAN runs should precede larger battles.

## Scope and next work

Required gameplay and networking systems are implemented. Verification limits above remain explicit;
no unrun check is counted as passed. Guests/statistics are in-memory, full instances can split a
party, hits use current authoritative time without rewind, and public deployment needs operational
admission/origin/TLS policy. The existing Vite large-chunk advisory remains; production compilation
succeeds. See the network guide for exact bounds and security assumptions.

The next feature milestone is **Planetary Atmospheres, Terrain & Landing**. Keep terrain rendering
separate from shared logical coordinates/collision authority. Later battles, squadrons, missions and
persistent progression should follow measured network/bandwidth improvements.
