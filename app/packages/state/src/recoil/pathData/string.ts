import { VALID_KEYPOINTS } from "@fiftyone/utilities";
import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { isLightningPath, lightning, lightningUnlocked } from "../lightning";
import * as schemaAtoms from "../schema";
import * as selectors from "../selectors";
import { noneCount } from "./counts";

export const stringResults = selectorFamily({
  key: "stringResults",
  get:
    (params: { path: string; modal: boolean; extended: boolean }) =>
    ({ get }) => {
      const keys = params.path.split(".");
      let parent = keys[0];
      const field = get(schemaAtoms.field(parent));

      if (!field && parent === "frames") {
        parent = `frames.${keys[1]}`;
      }

      const isSkeletonPoints =
        VALID_KEYPOINTS.includes(
          get(schemaAtoms.field(parent)).embeddedDocType
        ) && keys.slice(-1)[0] === "points";

      if (isSkeletonPoints) {
        const skeleton = get(selectors.skeleton(parent));
        if (skeleton && skeleton.labels) {
          return {
            count: skeleton.labels.length,
            results: skeleton.labels.map((value) => ({ value, count: null })),
          };
        }
      }

      if (
        !params.modal &&
        get(isLightningPath(params.path)) &&
        get(lightning) &&
        !get(lightningUnlocked)
      ) {
        return { count: null, results: [] };
      }

      return get(stringCountResults(params));
    },
});

export const stringCountResults = selectorFamily({
  key: "stringCountResults",
  get:
    (params: { path: string; modal: boolean; extended: boolean }) =>
    ({ get }) => {
      const data = get(aggregation(params));
      if (data.__typename !== "StringAggregation") {
        throw new Error("unexpected");
      }

      let count = data.count;

      const results: { value: string | null; count: number | null }[] = [
        ...data.values,
      ];

      const none = get(noneCount(params));
      if (none) {
        results.push({ value: null, count: none });
        count++;
      }

      return {
        count,
        results,
      };
    },
});
