# Asset credits

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

## Interface font

Share Tech Mono is bundled in `public/fonts/`. Its SIL Open Font License is included there.
