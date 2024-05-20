import { describe, expect, it } from "vitest";

import { TEMPORAL_DETECTION, TEMPORAL_DETECTIONS } from "@fiftyone/utilities";
import { filterTemporalLabel } from "./classifications";

const LABEL_BASE = {
  id: "",
  label: "",
  tags: [],
};

describe("classification and temporal detection label filtering", () => {
  it("filters temporal detections", () => {
    for (const cls of [TEMPORAL_DETECTION, TEMPORAL_DETECTIONS]) {
      expect(
        filterTemporalLabel(cls, { ...LABEL_BASE, support: [1, 2] }, 2)
      ).toBe(true);

      expect(
        filterTemporalLabel(cls, { ...LABEL_BASE, support: [1, 2] }, 3)
      ).toBe(false);
    }
  });
});
