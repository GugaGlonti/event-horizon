export function seededRandom(seed: number) {
  let state = seed | 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    state = (state ^ (state >>> 14)) | 0;
    return (state >>> 0) / 4294967296;
  };
}
