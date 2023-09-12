import _ from "lodash";
import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");

import {
  TestSelector,
  TestSelectorFamily,
  setMockAtoms,
} from "../../../../__mocks__/recoil";
import * as options from "./options";
import { State } from "./types";

describe("Resolves media fields only if they exist", () => {
  it("grid media field is not 'filepath' if the media field atom value is a field path", () => {
    const test = <TestSelectorFamily<typeof options.selectedMediaField>>(
      (<unknown>options.selectedMediaField(false))
    );
    setMockAtoms({
      fieldPaths: (params) => {
        if (_.eq(params, { space: State.SPACE.SAMPLE })) {
          throw new Error("unexpected params");
        }

        return ["filepath", "thumbnail_path"];
      },
      selectedMediaFieldAtomFamily: () => "thumbnail_path",
    });

    expect(test()).toEqual("thumbnail_path");
  });

  it("grid media field is 'filepath' if the media field atom value is not a field path", () => {
    const test = <TestSelectorFamily<typeof options.selectedMediaField>>(
      (<unknown>options.selectedMediaField(false))
    );
    setMockAtoms({
      fieldPaths: (params) => {
        if (_.eq(params, { space: State.SPACE.SAMPLE })) {
          throw new Error("unexpected params");
        }

        return ["filepath"];
      },
      selectedMediaFieldAtomFamily: () => "thumbnail_path",
    });

    expect(test()).toEqual("filepath");
  });
});

describe("Resolves configured sidebar mode priority", () => {
  const test = <
    TestSelectorFamily<typeof options.configuredSidebarModeDefault>
  >(<unknown>options.configuredSidebarModeDefault(false));

  it("resolves to all", () => {
    setMockAtoms({
      appConfigDefault: (params) => null,
      datasetAppConfig: { sidebarMode: "best" },
      sidebarMode: (modal) => "all",
    });
    expect(test()).toBe("all");
  });
  it("resolves to fast", () => {
    setMockAtoms({
      appConfigDefault: (params) => "best",
      datasetAppConfig: { sidebarMode: "fast" },
      sidebarMode: (modal) => null,
    });
    expect(test()).toBe("fast");
  });

  it("resolves to all", () => {
    setMockAtoms({
      appConfigDefault: (params) => "all",
      datasetAppConfig: { sidebarMode: null },
      sidebarMode: (modal) => null,
    });
    expect(test()).toBe("all");
  });
});

describe("Resolves to resolved sidebar bar and translates best correctly", () => {
  const test = <TestSelectorFamily<typeof options.resolvedSidebarMode>>(
    (<unknown>options.resolvedSidebarMode(false))
  );

  it("resolves to all", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "all",
    });
    expect(test()).toBe("all");
  });

  it("resolves to fast", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      aggregationQuery: {
        aggregations: [
          {
            __typename: "RootAggregation",
            count: 1,
            expandedFieldCount: 15,
            frameLabelFieldCount: 1,
          },
        ],
      },
    });
    expect(test()).toBe("fast");
  });

  it("resolves to fast", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      aggregationQuery: {
        aggregations: [
          {
            __typename: "RootAggregation",
            count: 1,
            expandedFieldCount: 14,
            frameLabelFieldCount: 1,
          },
        ],
      },
    });
    expect(test()).toBe("fast");
  });

  it("resolves to fast", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      aggregationQuery: {
        aggregations: [
          {
            __typename: "RootAggregation",
            count: 10000,
            expandedFieldCount: 14,
            frameLabelFieldCount: 0,
          },
        ],
      },
    });
    expect(test()).toBe("fast");
  });

  it("resolves to all", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      aggregationQuery: {
        aggregations: [
          {
            __typename: "RootAggregation",
            count: 9999,
            expandedFieldCount: 14,
            frameLabelFieldCount: 0,
          },
        ],
      },
    });
    expect(test()).toBe("all");
  });

  it("resolves to fast", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      aggregationQuery: {
        aggregations: [
          {
            __typename: "RootAggregation",
            count: 1000,
            expandedFieldCount: 15,
            frameLabelFieldCount: 0,
          },
        ],
      },
    });
    expect(test()).toBe("fast");
  });

  it("resolves to fast", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      aggregationQuery: {
        aggregations: [
          {
            __typename: "RootAggregation",
            count: 0,
            expandedFieldCount: 0,
            frameLabelFieldCount: 1,
          },
        ],
      },
    });
    expect(test()).toBe("fast");
  });

  it("throws error", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      aggregationQuery: {
        aggregations: [
          {
            __typename: "Aggregation",
            count: 0,
            expandedFieldCount: 0,
            frameLabelFieldCount: 0,
          },
        ],
      },
    });

    expect(test).toThrow(Error);
  });
});

describe("Resolves the large video datasets threshold", () => {
  const test = <TestSelector<typeof options.isLargeVideo>>(
    (<unknown>options.isLargeVideo)
  );

  it("resolves to true", () => {
    setMockAtoms({
      aggregationQuery: { aggregations: [{ count: 1000 }] },
      isVideoDataset: true,
    });
    expect(test.call()).toBe(true);
  });

  it("resolves to false", () => {
    setMockAtoms({
      aggregationQuery: { aggregations: [{ count: 999 }] },
    });
    expect(test.call()).toBe(false);
  });

  it("resolves to false", () => {
    setMockAtoms({
      aggregationQuery: { aggregations: [{ count: 1000 }] },
      isVideoDataset: false,
    });
    expect(test.call()).toBe(false);
  });
});
