import { describe, expect, it } from "vitest";

import { zoomAspectRatio } from "../zoom";
import { RegularLabel } from "./base";
import DetectionOverlay from "./detection";
import * as index from "./index";
import { getHashLabelColorByInstance } from "./util";

describe("label overlay processing", () => {
  it("omits undefined labels", () => {
    expect(index.fromLabel(DetectionOverlay)("field", undefined)).toStrictEqual(
      [],
    );
  });

  it("resolves empty label lists", () => {
    expect(
      index.fromLabelList(DetectionOverlay, "detections")("field", undefined),
    ).toStrictEqual([]);
  });

  it("resolves empty object label lists", () => {
    expect(
      index.fromLabelList(DetectionOverlay, "detections")("field", {}),
    ).toStrictEqual([]);
  });

  it("label hash is generated correctly", () => {
    const hashLabelWithIndex0 = getHashLabelColorByInstance({
      id: "id-0",
      label: "zero-index-label",
      index: 0,
    } as RegularLabel);

    const hashLabelWithIndex1 = getHashLabelColorByInstance({
      id: "id-1",
      label: "one-index-label",
      index: 1,
    } as RegularLabel);

    const hashLabelWithUndefinedIndex = getHashLabelColorByInstance({
      id: "id-no-index",
      label: "label-no-index",
    } as RegularLabel);

    const hashLabelWithUndefinedIndexUndefinedId = getHashLabelColorByInstance({
      label: "only-label-no-index-no-id",
    } as RegularLabel);

    expect(hashLabelWithIndex0).toEqual("zero-index-label-0-");
    expect(hashLabelWithIndex1).toEqual("one-index-label-1-");
    expect(hashLabelWithUndefinedIndex).toEqual("label-no-index.id-no-index");
    expect(hashLabelWithUndefinedIndexUndefinedId).toEqual(
      "only-label-no-index-no-id",
    );
  });
});

describe("zoom points", () => {
  it("include a Polylines field's points", () => {
    const schema = {
      lanes: {
        dbField: "lanes",
        embeddedDocType: "fiftyone.core.labels.Polylines",
        fields: {},
        ftype: "fiftyone.core.fields.EmbeddedDocumentField",
        name: "lanes",
        path: "lanes",
      },
    } as never;
    const sample = {
      lanes: {
        _cls: "Polylines",
        polylines: [
          {
            points: [
              [
                [0.1, 0.1],
                [0.5, 0.3],
              ],
            ],
          },
        ],
      },
    };

    expect(zoomAspectRatio(sample, schema, 1)).toBeCloseTo(2);
  });
});
