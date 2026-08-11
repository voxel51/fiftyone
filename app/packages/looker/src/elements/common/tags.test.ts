import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseState, Sample } from "../../state";
import { computeTagData } from "./computeTagData";
import { TagsElement } from "./tags";

vi.mock("./computeTagData", () => ({
  computeTagData: vi.fn(() => []),
}));

const makeState = (
  options: Partial<BaseState["options"]> = {},
): Readonly<BaseState> =>
  ({
    config: { fieldSchema: {} },
    options: {
      activePaths: ["ground_truth"],
      attributeVisibility: {},
      coloring: { by: "field", pool: ["#ff0000"], seed: 0 },
      customizeColorSetting: [],
      fontSize: 16,
      filter: () => true,
      labelTagColors: {},
      selectedLabelTags: [],
      showPatchLabels: false,
      shownLabelAttributes: {},
      timeZone: "UTC",
      ...options,
    },
    playing: false,
  }) as unknown as Readonly<BaseState>;

const boot = () => {
  const element = new TagsElement<BaseState>();
  element.boot({
    abortController: new AbortController(),
    config: { thumbnail: true } as BaseState["config"],
    dispatchEvent: vi.fn(),
    update: vi.fn(),
  });
  return element;
};

describe("TagsElement", () => {
  beforeEach(() => {
    vi.mocked(computeTagData).mockClear();
  });

  it("recomputes tag data when only showPatchLabels changes", () => {
    const element = boot();
    const sample = { tags: [] } as unknown as Readonly<Sample>;

    element.renderSelf(makeState(), sample);
    expect(computeTagData).toHaveBeenCalledTimes(1);

    element.renderSelf(makeState(), sample);
    expect(computeTagData).toHaveBeenCalledTimes(1);

    element.renderSelf(makeState({ showPatchLabels: true }), sample);
    expect(computeTagData).toHaveBeenCalledTimes(2);
    expect(vi.mocked(computeTagData).mock.lastCall?.[0].showPatchLabels).toBe(
      true,
    );
  });
});
