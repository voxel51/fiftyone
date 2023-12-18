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
      configData: { config: { sidebarMode: null } },
      datasetAppConfig: { sidebarMode: "best" },
      sidebarMode: (modal) => "all",
    });
    expect(test()).toBe("all");
  });
  it("resolves to fast", () => {
    setMockAtoms({
      configData: { config: { sidebarMode: "best" } },
      datasetAppConfig: { sidebarMode: "fast" },
      sidebarMode: (modal) => null,
    });
    expect(test()).toBe("fast");
  });

  it("resolves to all", () => {
    setMockAtoms({
      configData: { config: { sidebarMode: "all" } },
      datasetAppConfig: { sidebarMode: null },
      sidebarMode: (modal) => null,
    });
    expect(test()).toBe("all");
  });
});

describe("Resolves sidebar mode", () => {
  const test = <TestSelectorFamily<typeof options.resolvedSidebarMode>>(
    (<unknown>options.resolvedSidebarMode(false))
  );

  it("resolves to all", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "all",
      datasetSampleCount: 1,
      sidebarEntries: () => [],
      isVideoDataset: false,
    });
    expect(test()).toBe("all");
  });

  it("resolves to fast", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      datasetSampleCount: 10000,
    });
    expect(test()).toBe("fast");
  });

  it("resolves to all", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      datasetSampleCount: 9999,
    });
    expect(test()).toBe("all");
  });

  it("resolves to fast", () => {
    setMockAtoms({
      configuredSidebarModeDefault: (modal) => "best",
      datasetSampleCount: 10000,
    });
    expect(test()).toBe("fast");
  });
});

describe("Resolves the large video datasets threshold", () => {
  const test = <TestSelector<typeof options.isLargeVideo>>(
    (<unknown>options.isLargeVideo)
  );

  it("resolves to true", () => {
    setMockAtoms({
      datasetSampleCount: 1000,
      isVideoDataset: true,
    });
    expect(test.call()).toBe(true);
  });

  it("resolves to false", () => {
    setMockAtoms({
      datasetSampleCount: 999,
    });
    expect(test.call()).toBe(false);
  });

  it("resolves to false", () => {
    setMockAtoms({
      datasetSampleCount: 10000,
      isVideoDataset: false,
    });
    expect(test.call()).toBe(false);
  });
});
