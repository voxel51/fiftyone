import { VALID_KEYPOINTS } from "@fiftyone/utilities";
import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import * as schemaAtoms from "../schema";
import * as selectors from "../selectors";
import { noneCount } from "./counts";

export const stringCountResults = selectorFamily({
  key: "stringCountResults",
  get:
    (params: { path: string; modal: boolean; extended: boolean }) =>
    ({ get }): { count: number; results: [string | null, number][] } => {
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
            results: skeleton.labels.map((label) => [
              label as string | null,
              -1,
            ]),
          };
        }
      }
      const data = get(aggregation(params));

      if (data.__typename !== "StringAggregation") {
        throw new Error("unexpected");
      }

      let count = data.count;

      const results: [string | null, number][] = data.values.map(
        ({ count, value }) => [value, count]
      );
      const none: number = get(noneCount(params));

      if (none) {
        results.push([null, none]);
        count++;
      }

      return {
        count,
        results,
      };
    },
});
