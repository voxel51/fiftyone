import { LRUCache } from "lru-cache";

const MAX_COLOR_CACHE_SIZE = 1000;

export interface ResolveColor {
  key: string | number;
  seed: number;
  color: string;
}

export default (): [
  (pool: string[], seed: number, key: string | number) => Promise<string>,
  (result: ResolveColor) => void
] => {
  const cache = new LRUCache<number, Record<string | number, string>>({
    max: MAX_COLOR_CACHE_SIZE,
  });

  const requests = {};
  const promises = {};

  return [
    (pool, seed, key) => {
      if (!cache.has(seed)) {
        cache[seed] = {};
      }

      const colors = cache[seed];

      if (!(key in colors)) {
        if (!(seed in requests)) {
          requests[seed] = {};
          promises[seed] = {};
        }

        const seedRequests = requests[seed];
        const seedPromises = promises[seed];

        if (!(key in seedRequests)) {
          seedPromises[key] = new Promise((resolve) => {
            seedRequests[key] = resolve;
            postMessage({
              method: "requestColor",
              key,
              seed,
              pool,
            });
          });
        }

        return seedPromises[key];
      }

      return Promise.resolve(colors[key]);
    },
    ({ key, seed, color }) => {
      requests[seed][key](color);
    },
  ];
};
