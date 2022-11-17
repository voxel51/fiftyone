import { expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");
import * as options from "./options";

import {
  __setMockValues,
  TestSelector,
  TestSelectorFamily,
} from "../../__mocks__/recoil";

it("Correctly resolves configured sidebar mode priority", () => {
  const test = <
    TestSelectorFamily<typeof options.configuredSidebarModeDefault>
  >(<unknown>options.configuredSidebarModeDefault(false));

  __setMockValues({
    datasetAppConfig: { sidebarMode: "best" },
    sidebarMode: (modal: boolean) => "all",
  });

  expect(test()).toBe("all");

  __setMockValues({
    datasetAppConfig: { sidebarMode: "fast" },
    sidebarMode: (modal: boolean) => null,
    appConfigDefault: (params) => "best",
  });

  expect(test()).toBe("fast");
});

it("Correctly resolves the large video datasets threshold", () => {
  const test = <TestSelector<typeof options.isLargeVideo>>(
    (<unknown>options.isLargeVideo)
  );
  __setMockValues({
    aggregationQuery: { aggregations: [{ count: 1001 }] },
    isVideoDataset: true,
  });
  expect(test.call()).toBe(true);

  __setMockValues({
    aggregationQuery: { aggregations: [{ count: 1000 }] },
  });
  expect(test.call()).toBe(false);

  __setMockValues({
    aggregationQuery: { aggregations: [{ count: 1001 }] },
    isVideoDataset: false,
  });
  expect(test.call()).toBe(false);
});
