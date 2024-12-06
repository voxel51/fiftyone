export interface ResolveColor {
  key: string | number;
  seed: number;
  color: string;
}

export default (): [
  (pool: string[], seed: number, key: string | number) => Promise<string>,
  (result: ResolveColor) => void
] => {
  const cache = {};
  const requests = {};
  const promises = {};

  return [
    (pool, seed, key) => {
      if (!(seed in cache)) {
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
