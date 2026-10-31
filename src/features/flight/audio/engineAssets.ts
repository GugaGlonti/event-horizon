const urls = {
  idle: new URL('./assets/idle.wav', import.meta.url).href,
  turbine: new URL('./assets/turbine.wav', import.meta.url).href,
  boost: new URL('./assets/boost.wav', import.meta.url).href,
  jets: new URL('./assets/jets.wav', import.meta.url).href,
  engage: new URL('./assets/engage.wav', import.meta.url).href,
  release: new URL('./assets/release.wav', import.meta.url).href,
};

export type EngineStem = keyof typeof urls;
export type EncodedEngine = Record<EngineStem, ArrayBuffer>;
export type EngineAssetLoader = (signal: AbortSignal) => Promise<EncodedEngine>;

export const loadEngineAssets: EngineAssetLoader = async (signal) => {
  const entries = await Promise.all(
    Object.entries(urls).map(async ([name, url]) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Unable to load engine ${name}: ${response.status}`);
      return [name, await response.arrayBuffer()] as const;
    }),
  );
  return Object.fromEntries(entries) as EncodedEngine;
};
