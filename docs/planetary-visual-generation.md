# Seeded planetary visual generation

Surface generation revision 2 builds on the existing charted galaxy. The ten systems, 69 bodies,
49 landable surfaces and 45 named settlements retain their identities. Settlement coordinates,
elevations, sizes and seeds are now explicit authored anchors. Survey zones, body radii/rotation,
arrival poses, spaceport pads and approach poses are preserved against an independent pre-revision
fixture. Surrounding natural terrain and city buildings can evolve.

## Shared geography and surface descriptions

The renderer-independent height field uses bounded spherical-domain value noise for continental
shelves, warped regional ridges and fine relief. The existing detail setting bounds one to eight
noise samples. Named modifiers produce elongated ridges/canyons, crater/caldera rims, fractures and
archipelago uplifts. All natural heights remain inside the configured relief; engineered foundation
and liquid bounds remain conservative. Physics continues using the height-only path.

Pelagos has a deliberate reference region around longitude 2.25: ocean to the south, forested
lowlands, Western Ridge and Port Helios. Latitude, elevation, slope, climate and seeded moisture
variation determine physical cover fractions (vegetation, stone, sediment and frozen cover), forest
coverage and volcanic emission. The planetary chart and terrain use the same surface description.
Desert, oceanic, frozen, volcanic and barren profiles share the pipeline with distinct palettes and
landform rules. Gas giants retain their band/storm rendering.

Irregular seeded city foundations replace circular outer edges. They remain tangent planes beneath
solid building plots and pads, with a smooth shoulder inside the existing broad-phase bound.
Generated settlements still require dry gentle natural terrain. Authored locations validate their
dry engineered foundation, allowing a new landscape without moving a known city or berth.

## Rendering and resource ownership

- Orbital cube maps sample the same final height/biome field. Each body starts with 64-pixel faces;
  only the active planet receives 256-pixel faces. Alpha stores a quantized presentation height;
  physics never reads it. Coarse slope estimates and texture resolution intentionally omit fine
  surface detail. Existing parent patches/globe coverage stay until matching terrain is ready.
- Terrain patches transfer radial directions, normalized cover and forest/lava weights alongside
  their existing positions/normals/morph data. Slope uses each vertex's radial direction. A small
  repeatable detail map supplies stable body-local grain, surface breakup and distant forest canopy.
- Two tree silhouettes, shrubs and rock clusters stream in projected 256 m cube-face cells. Water,
  steep ground, roads, survey foundations, cities and approach corridors exclude scatter. Four
  opaque instanced families use stable distance fades into surface canopy shading. Scatter is
  decorative; large geological obstacles remain shared terrain.
- District-first cities assemble slab/setback towers, low-rise blocks, hangars, industrial modules
  and dome/habitat buildings. Normalized recipes generate both actual mesh parts and authoritative
  oriented collision boxes. A finite collision budget is distributed across large capitals.
  The nearest city streams selected blocks; other buildings use simplified proxies. Roads,
  pavements, roof shading, occupied windows, a civic landmark and dedicated hangars add detail.
- Ocean wave normals/glint, coherent cloud patterns and density-dependent hemisphere fill remain
  inexpensive approximations. Cosmetic water/cloud motion respects reduced motion.

SystemScene owns the two-worker queue. Terrain roots/refinement precede scenery, surface-map strips
and transport ribbons. Short strips prevent a full atlas face from monopolizing a worker. Job IDs,
cancellation and the surface revision prevent old responses from adopting disposed work. Workers
terminate on scene teardown. Published maps are released after React commits their replacement;
geometry, instance buffers and materials have explicit owners. No transforms enter React/Zustand
per frame. Diagnostics publish twice per second.

## Budgets and compatibility

| Resource              | Bound                                                           |
| --------------------- | --------------------------------------------------------------- |
| Terrain               | 150 leaves; 256 retained; 384 hard cache ceiling                |
| DPR                   | 1.5 maximum                                                     |
| Planetary generation  | Two workers; 96 queued jobs maximum                             |
| Scenery               | 32 cells; 4,096 ceiling; current family capacities total 3,072  |
| Detailed city blocks  | 16, belonging to the nearest city                               |
| City visibility       | Full-detail limit 16 km; skyline limit 80 km                    |
| Facilities            | Existing 16/system, 32 ports/system and 512 boxes/facility      |
| Added GPU allocations | 32 MiB estimate including mipmaps and fixed instance capacities |
| Reference complexity  | 180 draws / 350,000 triangles                                   |

Cached rotated bounds reject irrelevant building sweeps before the existing oriented-box solver.
Bounds include rotated expanded-corner padding, preserving continuous collision behaviour.

Protocol **v5** rejects old clients because shared terrain/building geometry changed. Restart the
server and reload clients together. Inputs and ordinary snapshots retain their existing contents;
no meshes, texture maps or decorative instances cross the network. Guest identities remain temporary
and there is no persistence migration, account system or economy.

## Reproduce verification

Use `npm run verify:planetary` for the loopback-only QA authority and `npm run dev` for the client.
The scripts print the configured ports. Enter `orbit`, `coast`, `forest`, `ridge`, `city` or `city-pad`
in the QA terminal to position connected pilots. Positions are fixtures, not normal flight or game
protocol commands. `night` advances a rotating first landable body to its settlement's night and
positions pilots near its spaceport; Pelagos keeps its existing fixed rotation. `damage` supports
repair checks. Fixtures transport body-local poses through actual axial rotation.

Enable **Network diagnostics** in the flight menu. In development only, `?verifyDpr=1.5` forces the
existing DPR ceiling even on a DPR-1 test surface. Set a 1920x1080 CSS viewport and verify the reported
canvas is **2880x1620**. Let terrain/scenery settle, then use **Capture 60s**. The bounded capture
reports frame-interval p50/p95/p99, peak draws/triangles/allocated bytes, scenery/cell/block counts,
cache counts and canvas dimensions. Background visibility or gaps over 250 ms invalidate the run.
Cold streaming should be recorded separately. Frame intervals are not GPU timer queries.

The local goal is p50 <=16.7 ms, p95 <=20 ms and p99 <=33.3 ms. Raw captures and screenshots live in
[verification/planetary-visuals](verification/planetary-visuals/). Hardware is Apple M2 Pro, 12 CPU
cores / 19 GPU cores, 32 GiB, macOS, Node 22.20.0. Measurements are local evidence, not a universal
hardware guarantee or a production multiplayer capacity claim.

Load runs use `LOAD_SCENARIO=city LOAD_SECONDS=60 npm run test:load -- 2 8 16`. Server and bots share
one process; binary payload counts exclude WebSocket/TCP headers. Raw before/after results include
tick times, CPU/RSS, bandwidth, acknowledgement latency and overruns. The denser city required an
additional conservative box rejection before the final run.

## Measured acceptance — 2 November 2026

Paired 60-second foreground captures used the same Chrome tab, 1920x1080 CSS viewport and
2880x1620 drawing buffer on the M2 Pro above. The baseline checkout used isolated Vite caches and
the same diagnostic capture code. Every accepted capture is complete and valid. Initial in-app
browser baseline files are retained as supplementary evidence; the `before-*-chrome.json` files
are the comparable baseline. Values below are frame intervals in milliseconds. Median was 8.3 ms
in all twelve paired captures.

| View                 | Before p95 / p99 | Final p95 / p99 | Final peak draws / triangles |
| -------------------- | ---------------- | --------------- | ---------------------------- |
| Orbit                | 10.1 / 14.9      | 10.0 / 13.8     | 28 / 54,960                  |
| Coastline            | 10.7 / 13.9      | 9.4 / 11.3      | 74 / 85,908                  |
| Forest               | 11.1 / 14.4      | 10.1 / 12.2     | 78 / 291,122                 |
| Western Ridge        | 9.8 / 12.3       | 10.8 / 12.4     | 64 / 83,804                  |
| Port Helios approach | 10.3 / 13.8      | 10.9 / 12.3     | 100 / 90,774                 |
| Landing pad          | 11.3 / 14.6      | 10.1 / 11.7     | 92 / 94,366                  |

These are repeatable fixed views, with fixture-assisted placement. They pass the agreed local
frame-time and complexity gates. Final tracked allocations peak at 6.23 MiB across these views;
terrain stays at 150 leaves / 256 retained patches, scenery at 32 cells, and detailed city blocks
at 16. Latest individual terrain jobs in the saved samples are 1.6–2.1 ms; these are worker job
durations, not total cold-generation latency.

The separate `cold-forest-motion.json` capture starts before an uncached forest placement, then
flies forward across cells and brakes. It records p50 8.3 / p95 10.4 / p99 12.6 ms, 108 peak draws,
297,556 triangles, 2,033 scenery instances and 6.80 MiB peak allocations. It is not a cold browser
startup benchmark. Parent coverage remained visible while replacement terrain streamed.

### Authoritative city load

Each row is a 60-second real-client loopback run. CPU includes authority and bots and uses one
logical core as 100%; RSS is whole-process memory. Downstream values are binary payload KiB/s per
client. These short single-process runs cannot establish production capacity or WAN performance.

| Clients | Mean tick before → final | Max final tick | Overruns before → final | Final ack p95 | Final CPU / RSS   | Final down / up |
| ------- | ------------------------ | -------------- | ----------------------- | ------------- | ----------------- | --------------- |
| 2       | 2.725 → 2.307 ms         | 18.60 ms       | 0 → 0                   | 38 ms         | 11.0% / 143.8 MiB | 105.7 / 4.2     |
| 8       | 4.347 → 4.969 ms         | 53.36 ms       | 3 → 1                   | 47 ms         | 21.9% / 138.1 MiB | 266.1 / 4.1     |
| 16      | 8.239 → 8.850 ms         | 32.80 ms       | 2 → 0                   | 59 ms         | 40.6% / 206.8 MiB | 484.6 / 4.1     |

Final runs sustain 30 Hz. The 8/16-client mean tick cost increases by approximately 14%/7%; this
is a measured tradeoff of denser shared building geometry. Conservative cached box rejection keeps
the final 16-client run below the 33.3 ms tick interval. The single 8-client overrun remains visible
in the raw report rather than being discarded. Longer memory/latency soaks remain future work.

### Behavioral checks and limits

`npm run check` passes: lint, all 517 tests across 37 files (including eight real-server integration
tests), typecheck and production build. The existing large-chunk build advisory remains. New tests
cover authored anchor preservation, v4 rejection, deterministic/bounded fields and cover, cube/patch
boundaries, strip equivalence, scenery exclusions, district/corridor placement, actual mesh vertices
inside shared collision recipes, rotated sweep padding, worker cancellation/failure/Strict Mode,
allocation release and benchmark validity.

Browser checks include a continuous normal-controller descent from the 22 km orbit fixture to the
survey base, switching from chase to cockpit during descent, landing and continuous takeoff. Pad
placement is fixture-assisted: one client captures Port Helios Pad 1, a second sees it occupied while
other pads remain available, services restore damaged hull/shields/heat, and departure uses continuous
undocking. The rotating Umbra night fixture verifies stable body frames and emissive windows.

The production preview completes Solara → Vesper → Aether → Solara, followed by Kharon, Nivalis,
Pelagia and another Solara return. Saved views cover temperate, barren night, volcanic, desert,
frozen and oceanic presentation. Normal controls fly the coast fixture through the lowlands into
Port Helios's 2.1 km approach area without further relocation; docking remains the separate pad
check above. Jump cancellation retains the source, maps suppress controls, and offline reset returns
to Solara. At 390x844 CSS pixels the galaxy/planetary maps have 390 px document width with no
horizontal overflow; Tab remains in the dialog and Escape works from a focused control. The checked
development and production browser consoles contain no warnings or errors.

The development lifecycle comparison in `lifecycle.txt` records 6.1 MiB / 246 cached patches before
departure, 0.7 MiB / zero patches/cells/blocks in distant Vesper, then 6.2 MiB / 256 cached patches
on returning to the same Port Helios view. The extra ten retained patches explain the small byte
difference; geometry/texture counts are lower after return (180/6 versus 222/8), with zero worker
errors. This is bounded teardown/recreation evidence, not a long memory soak or a driver VRAM test.

QA placements clear patrols and grant temporary protection only in their current room. A transfer
uses the normal three-second admission protection; idle pilots can subsequently die to the existing
arrival patrol. Server damage attribution confirmed this during verification. Destination fixtures
are therefore refreshed for controlled visual inspection. No normal combat or protection behaviour
was changed to obtain these results.

Small scatter is intentionally decorative. City proxies simplify buildings outside the 16 selected
blocks; there are no interiors, individual building lights, dynamic shadow passes, erosion simulation,
accounts or saved-world migration. GPU allocation counts are estimates of owned data, not driver
VRAM. Static screenshots and compilation alone do not establish continuous-flight visual quality;
the control checks above and the recorded streaming run provide separate evidence. Other hardware,
all possible camera angles, long sessions and real network conditions are not certified.
