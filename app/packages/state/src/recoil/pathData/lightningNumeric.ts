import { selectorFamily } from "recoil";
import { lightningQuery } from "../lightning";

export const lightningNumericResults = selectorFamily({
  key: "lightningNumericResults",
  get:
    (path: string) =>
    ({ get }) => {
      const [data] = get(lightningQuery([{ path }]));

      if (data.__typename === "IntLightningResult") {
        return {
          max: data.intMax,
          min: data.intMin,
        };
      }

      if (data.__typename === "FloatLightningResult") {
        return data;
      }

      throw new Error("bad");
    },
});

export const lightningBounds = selectorFamily<[number, number] | null, string>({
  key: "lightningBounds",
  get:
    (path) =>
    ({ get }) => {
      const data = get(lightningNumericResults(path));

      if (typeof data.max !== "number" || typeof data.min !== "number") {
        return null;
      }

      return [data.min, data.max];
    },
});

export const lightningNonfinites = selectorFamily({
  key: "lightningNonfinites",
  get:
    (path: string) =>
    ({ get }) => {
      const [data] = get(lightningQuery([{ path }]));
      if (data.__typename === "FloatLightningResult") {
        return {
          inf: data.inf,
          nan: data.nan,
          ninf: data.ninf,
        };
      }

      return {};
    },
});
