# Asset credits

## Spacecraft models

The bundled Spitfire, Striker and Insurgent hulls are by **Quaternius**, from the May 2021
[Ultimate Spaceships Pack](https://quaternius.com/packs/ultimatespaceships.html). The
[original release announcement](https://www.patreon.com/quaternius/posts/ultimate-pack-51541119)
and the included `src/features/spacecraft/assets/License-Quaternius.txt` identify this release as
**CC0 1.0 Universal**. These model derivatives retain CC0; project code remains MIT.

The creator's Google Drive download was quota-limited on 2026-11-01. Originals were obtained from
the [archived release mirror](https://github.com/yolanother/QuaterniusUltimateSpaceships/tree/c005a95cd2166989a3a8a115e2f401d69fab580e),
pinned to commit `c005a95cd2166989a3a8a115e2f401d69fab580e`, with its original CC0 license.
This attribution applies specifically to that archived release, not newer Quaternius assets.

| Hull      | Paint source                           | Triangles | In-game use             |
| --------- | -------------------------------------- | --------- | ----------------------- |
| Spitfire  | `Spitfire/Textures/Spitfire_Blue.png`  | 3,512     | Kestrel player exterior |
| Striker   | `Striker/Textures/Striker_Red.png`     | 4,530     | Enemy fighter           |
| Insurgent | `Insurgent/Textures/Insurgent_Red.png` | 8,292     | Alternate enemy hull    |

`scripts/build-spacecraft-assets.mjs` bakes the original glTF vertices/normals into the game's -Z
forward frame, centers each hull inside a 4.8m sphere and transforms measured exhaust mounts.
It packs the unchanged topology/UVs and selected paint into self-contained GLB files, using opaque
materials with modest metallic/roughness values and a restrained emissive texture lift for readability.
The three GLBs total about 1.6 MB. `assets/manifest.json` records source/output SHA-256 hashes,
triangle counts and transformed nozzle anchors. Original downloads are not bundled.

To reproduce, download each hull's `glTF/NAME.gltf` and paint PNG from the pinned mirror, plus
`License.txt`, into one source directory. Prepare `Spitfire.jpg`, `Striker.jpg` and `Insurgent.jpg`
as 1024px JPEGs at quality 85. The initial conversion used macOS `sips`, for example:

```sh
sips -Z 1024 -s format jpeg -s formatOptions 85 Spitfire_Blue.png --out Spitfire.jpg
node scripts/build-spacecraft-assets.mjs /path/to/spacecraft-sources
```

Repeat the image conversion with `Striker_Red.png` and `Insurgent_Red.png`. The packing script uses
only Node built-ins. The license, model buffers and textures ship locally; no runtime asset services
or external decoder downloads are needed.

## Hyperdrive sound

The four bundled WAV files in `src/features/exploration/audio/assets/` are original edits of
three sounds by **kentspublicdomain** on Freesound. All three source pages explicitly offered the
sounds under **[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)** when checked on
2026-11-01. CC0 permits copying, editing and redistribution, including commercial use. The derived
WAV sounds are also offered under CC0. Repository code and authoring scripts retain the project's
MIT licence.

These assets contain no extracted Star Wars film or game audio. The sound design uses machinery,
varispeed, overlapping motor textures, relay transients and bass reinforcement. The production
approach was informed by [Ben Burtt's account of recording and transforming real machinery and
aircraft](https://www.starwars.com/news/empire-at-40-ben-burtt-interview); it is an interpretation,
not a reproduction of a particular film recording.

### Sources

The **public low-quality MP3 previews** linked below were downloaded, decoded to PCM16 WAV with
macOS `afconvert`, then edited. The original higher-quality Freesound WAV uploads were not used.
Source hashes refer to the downloaded MP3 bytes, not the decoded WAVs.

| Source by kentspublicdomain                                                                                                      | Material / use                                                                      | Downloaded preview                                                  | SHA-256                                                            |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Electric machine engine, rumble, large air-conditioner (328175)](https://freesound.org/people/kentspublicdomain/sounds/328175/) | Author's stereo recording of a large air conditioner; spool, transit and entry body | [MP3](https://cdn.freesound.org/previews/328/328175_5583936-lq.mp3) | `32c01cf13d743f538fed0032ec9222d1a7d742bb7692b10d30007ab23745a28c` |
| [Electric motor engine start stop (476943)](https://freesound.org/people/kentspublicdomain/sounds/476943/)                       | Author's designed motor effect; winding, phased bed and braking                     | [MP3](https://cdn.freesound.org/previews/476/476943_5583936-lq.mp3) | `9bb54f9d49cf56e5a8b54a98ecb8ead17936c3378070006fa42aade7ab9d9ec7` |
| [Electric switch click clicking (476954)](https://freesound.org/people/kentspublicdomain/sounds/476954/)                         | Author's designed switch effect; short entry and exit relay attacks                 | [MP3](https://cdn.freesound.org/previews/476/476954_5583936-lq.mp3) | `f2db6e9c9ffdf59cf7fe4f16c2c1fbddba7e3070463c26fc6919c706be89b034` |

### Derivatives and reproduction

`scripts/build-hyperdrive-audio.mjs` is the deterministic offline processing recipe. It uses no
third-party dependencies. Name the decoded inputs `machine.wav`, `motor.wav` and `switch.wav`, then run:

```sh
node scripts/build-hyperdrive-audio.mjs /path/to/decoded-sources
```

- `spool.wav`: 2.4 s stereo loop. Varispeed motor winding over lower machinery; short loop crossfade.
- `transit.wav`: 3.6 s stereo loop. Overlapping machinery at slightly different speeds and channel
  offsets produce beating, with a quieter motor layer underneath.
- `entry.wav`: 1.5 s one-shot. Falling varispeed machinery, reversed winding, relay attack and an
  original synthesized bass impulse.
- `exit.wav`: 1.05 s one-shot. Motor pressure/braking, relay attack and a shorter bass impulse.

All stems have DC/low-frequency filtering, low-pass filtering, soft saturation and bounded gain.
The output is 32 kHz stereo PCM16 WAV (about 1.1 MB total), supported by browser Web Audio without
an additional codec library. `assets/manifest.json` records durations, levels and derivative hashes.
Raw source downloads are not part of the repository.

For offline listening comparisons, add an explicit stem output directory and a preview directory:

```sh
node scripts/build-hyperdrive-audio.mjs /path/to/decoded-sources /tmp/hyperdrive-stems /tmp/hyperdrive-previews
```

This creates balanced, heavy and restrained full-jump WAV previews. Balanced approximates the default
in-game mix; the others are authoring comparisons, not additional game settings. Previews omit the
live compressor, parameter smoothing and quiet synthesized reinforcement, so they are not browser
output captures.

## Kestrel engine sound

The six WAV files in `src/features/flight/audio/assets/` are separate CC0 derivatives of the same
three kentspublicdomain recordings credited above. They use the same downloaded MP3 previews and
source hashes; there are no new external sound sources or licences.

- `idle.wav`: 3 s stereo loop of low machinery, slow motor winding and an original bass tone.
- `turbine.wav`: 2.5 s stereo loop of faster motor/machinery with softened upper frequencies.
  The game plays two copies at slightly different rates and stereo positions.
- `boost.wav`: 2.2 s stereo loop of rougher machinery and slower motor body.
- `jets.wav`: 1.6 s stereo loop with offset-source subtraction emphasizing pressure texture.
- `engage.wav`: 0.3 s relay/motor attack for boost engagement.
- `release.wav`: 0.7 s falling motor/pressure release for throttle or boost wind-down.

The independent offline recipe is `scripts/build-engine-audio.mjs`. The output uses the same
32 kHz stereo PCM16 format, loop crossfades, filtering, saturation and bounded normalization as the
hyperdrive assets (about 1.3 MB total). Its adjacent `manifest.json` records derivative hashes/levels.

```sh
node scripts/build-engine-audio.mjs /path/to/decoded-sources
node scripts/build-engine-audio.mjs /path/to/decoded-sources /tmp/engine-stems /tmp/engine-preview
```

The optional 17-second listening preview runs idle (0–3 s), acceleration (3–7), boost (7–10),
release (10–12), braking (12–14), then idle (14–17). It approximates the recorded layer's live
envelopes/rates; it omits the live compressor, cockpit filter, panning and quiet synthesized bed.
It is an authoring preview, not a browser audio capture.

Weapons and the fallback enemy pressure texture are original procedural audio generated by
`src/features/combat/audio/weaponTimbres.ts`. They use seeded filtered noise, short damped harmonics
and smooth attacks/tails. No external recording or film/game audio is used for those buffers.
The code retains the project's MIT licence.

To render an approximate 17-second combined mix (engine states, weapons and a stereo flyby):

```sh
node --experimental-strip-types scripts/preview-flight-soundscape.mjs /tmp/kestrel-soundscape.wav
```

This uses Node's built-in TypeScript stripping (Node 22.12+). The preview follows the live channel
headroom/ducking envelopes, but uses simple stereo panning and soft saturation; browser HRTF,
compressor, cockpit filtering and quiet reinforcement are not captured.

## Interface font

Share Tech Mono is bundled in `public/assets/fonts/`. Its SIL Open Font License is included there.
