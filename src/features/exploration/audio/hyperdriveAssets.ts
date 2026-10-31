const assetUrls = {
  spool: new URL('./assets/spool.wav', import.meta.url).href,
  transit: new URL('./assets/transit.wav', import.meta.url).href,
  entry: new URL('./assets/entry.wav', import.meta.url).href,
  exit: new URL('./assets/exit.wav', import.meta.url).href,
};

export type HyperdriveStem = keyof typeof assetUrls;
export type EncodedHyperdrive = Record<HyperdriveStem, ArrayBuffer>;
export type HyperdriveAssetLoader = (signal: AbortSignal) => Promise<EncodedHyperdrive>;

export const loadHyperdriveAssets: HyperdriveAssetLoader = async (signal) => {
  const entries = await Promise.all(
    Object.entries(assetUrls).map(async ([name, url]) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Unable to load hyperdrive ${name}: ${response.status}`);
      return [name, await response.arrayBuffer()] as const;
    }),
  );
  return Object.fromEntries(entries) as EncodedHyperdrive;
};
