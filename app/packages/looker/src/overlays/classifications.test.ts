import { describe, expect, it, vi } from "vitest";

import { TEMPORAL_DETECTION, TEMPORAL_DETECTIONS } from "@fiftyone/utilities";
import {
  filterTemporalLabel,
  TemporalDetectionOverlay,
} from "./classifications";

const LABEL_BASE = {
  id: "",
  label: "",
  tags: [],
};

describe("classification and temporal detection label filtering", () => {
  it("filters temporal detections", () => {
    for (const cls of [TEMPORAL_DETECTION, TEMPORAL_DETECTIONS]) {
      expect(
        filterTemporalLabel(cls, { ...LABEL_BASE, support: [1, 2] }, 2),
      ).toBe(true);

      expect(
        filterTemporalLabel(cls, { ...LABEL_BASE, support: [1, 2] }, 3),
      ).toBe(false);
    }
  });
});

describe("a video's classifications without a label list", () => {
  it.each([TEMPORAL_DETECTIONS, "fiftyone.core.labels.Classifications"])(
    "draws nothing for %s and does not throw",
    (cls) => {
      const overlay = new TemporalDetectionOverlay([
        ["events", undefined as never],
      ]);
      const state = {
        config: {
          fieldSchema: {
            events: {
              embeddedDocType: cls,
              ftype: "fiftyone.core.fields.EmbeddedDocumentField",
              fields: {},
              name: "events",
              path: "events",
            },
          },
        },
        frameNumber: 1,
        options: { activePaths: ["events"] },
      } as never;

      const ctx = { measureText: vi.fn(), fillText: vi.fn() };

      expect(() => overlay.draw(ctx as never, state)).not.toThrow();
      expect(overlay.getFilteredAndFlat(state)).toEqual([]);
      expect(ctx.fillText).not.toHaveBeenCalled();
    },
  );
});
