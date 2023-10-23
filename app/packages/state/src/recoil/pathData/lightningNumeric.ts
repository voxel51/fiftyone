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
