import { describe, expect, it } from "vitest";
import {
  createSeriesLabelTable,
  MAX_SERIES_LABEL_LENGTH,
  MAX_SERIES_LABELS,
  remapSeriesLabelCodes,
  SERIES_OVERFLOW_LABEL,
} from "./numeric-series-labels";

describe("createSeriesLabelTable", () => {
  it("assigns stable codes in first-seen order", () => {
    const table = createSeriesLabelTable();

    expect(table.code("dry")).toBe(0);
    expect(table.code("wet")).toBe(1);
    expect(table.code("dry")).toBe(0);
    expect(table.labels).toEqual(["dry", "wet"]);
  });

  it("shares one overflow code past capacity", () => {
    const table = createSeriesLabelTable();
    for (let index = 0; index < MAX_SERIES_LABELS; index += 1) {
      table.code(`value-${index}`);
    }

    const overflow = table.code("one more");

    expect(table.code("and another")).toBe(overflow);
    expect(table.labels[overflow]).toBe(SERIES_OVERFLOW_LABEL);
    expect(table.labels).toHaveLength(MAX_SERIES_LABELS + 1);
  });

  it("truncates long text before categorizing it", () => {
    const table = createSeriesLabelTable();
    const long = "x".repeat(MAX_SERIES_LABEL_LENGTH + 50);

    expect(table.code(long)).toBe(table.code(`${long}y`));
    expect(table.labels[0]).toHaveLength(MAX_SERIES_LABEL_LENGTH + 1);
  });
});

describe("remapSeriesLabelCodes", () => {
  it("re-expresses local codes in a shared table and keeps gaps", () => {
    const shared = createSeriesLabelTable();
    shared.code("wet");

    const remapped = remapSeriesLabelCodes(
      Float64Array.from([0, 1, Number.NaN, 0]),
      ["dry", "wet"],
      shared,
    );

    expect([...remapped]).toEqual([1, 0, Number.NaN, 1]);
    expect(shared.labels).toEqual(["wet", "dry"]);
  });

  it("codes plain numbers as text for a field known to hold text", () => {
    const shared = createSeriesLabelTable();
    shared.code("dry");

    const remapped = remapSeriesLabelCodes(
      Float64Array.from([7, Number.NaN, 7]),
      undefined,
      shared,
    );

    expect([...remapped]).toEqual([1, Number.NaN, 1]);
    expect(shared.labels).toEqual(["dry", "7"]);
  });
});
