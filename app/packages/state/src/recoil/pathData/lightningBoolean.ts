import { selectorFamily } from "recoil";

export const lightningBooleanResults = selectorFamily<
  {
    count: number | null;
    results: { count: number | null; value: string | null }[];
  },
  { path: string; modal: boolean; extended: boolean }
>({
  key: "lightningBooleanResults",
  get: () => () => {
    return {
      count: null,
      results: [
        { value: "False", count: null },
        { value: "True", count: null },
        { value: null, count: null },
      ],
    };
  },
});
