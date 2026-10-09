import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerHeaderProps } from "./types";
import ViewerHeader from "./ViewerHeader";

const stub = vi.hoisted(() => (cy: string) => () => <div data-cy={cy} />);

const harness = vi.hoisted(() => ({
  close: vi.fn(),
  copyLink: vi.fn(),
  clearHidden: vi.fn(),
  toggleFullscreen: vi.fn(),
  toggleSidebar: vi.fn(),
  toggleBrowser: vi.fn(),
  sample: {
    id: "sample-1" as string | undefined,
    slice: null as string | null,
    hasNext: true,
    hasPrevious: true,
    position: null as { index: number; total: number } | null,
  },
  context: { exploring: true, group: false, multimodal: false },
  hidden: 0,
  fullscreen: false,
  sidebar: { available: true, visible: true },
}));

vi.mock("./hooks", () => ({
  useCloseViewer: () => harness.close,
  useCopySampleLink: () => harness.copyLink,
  useViewerContext: () => harness.context,
  useViewerFullscreen: () => ({
    fullscreen: harness.fullscreen,
    toggle: harness.toggleFullscreen,
  }),
  useViewerHiddenLabels: () => ({
    clear: harness.clearHidden,
    count: harness.hidden,
  }),
  useViewerSample: () => harness.sample,
  useViewerSidebar: () => ({
    ...harness.sidebar,
    toggle: harness.toggleSidebar,
  }),
}));

vi.mock("@fiftyone/state", () => ({
  ModalMode: { EXPLORE: "explore", ANNOTATE: "annotate" },
  useOutsideClick: () => undefined,
}));

vi.mock("@fiftyone/actions", async () => {
  const { createContext } = await import("react");
  return {
    ActionIconSizeContext: createContext<number | undefined>(undefined),
    ColorScheme: stub("action-color-settings"),
    Options: stub("action-display-options"),
    Selected: stub("action-manage-selected"),
    Similarity: stub("action-sort-by-similarity"),
    Tag: stub("action-tag-sample-labels"),
  };
});

vi.mock("@fiftyone/operators", () => ({
  OperatorPlacements: ({ place }: { place: string }) => (
    <div data-cy={`placements-${place}`} />
  ),
  types: { Places: { SAMPLES_VIEWER_ACTIONS: "samples-viewer-actions" } },
  useOperatorBrowser: () => ({
    isVisible: false,
    toggle: harness.toggleBrowser,
  }),
}));

vi.mock("./components/GroupVisibilityPopout", () => ({
  default: stub("group-media-visibility-popout"),
  GROUP_VISIBILITY_TITLE: "Toggle renderer configuration",
}));

const stepper = { next: vi.fn(), previous: vi.fn() };
const mode = { annotate: vi.fn(), annotating: false, explore: vi.fn() };

const renderHeader = (props: Partial<ViewerHeaderProps> = {}) => {
  const { container } = render(
    <ViewerHeader
      datasetName="quickstart"
      mode={mode}
      stepper={stepper}
      {...props}
    />,
  );
  return (cy: string) =>
    container.querySelector<HTMLElement>(`[data-cy=${cy}]`);
};

beforeEach(() => {
  harness.sample = {
    id: "sample-1",
    slice: null,
    hasNext: true,
    hasPrevious: true,
    position: null,
  };
  harness.context = { exploring: true, group: false, multimodal: false };
  harness.hidden = 0;
  harness.fullscreen = false;
  harness.sidebar = { available: true, visible: true };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ViewerHeader", () => {
  it("names the dataset and sample, and leads back from both", () => {
    const get = renderHeader();

    expect(get("sample-page-header")).not.toBeNull();
    expect(get("viewer-header-title")?.textContent).toBe("sample-1");
    expect(get("viewer-header-slice")).toBeNull();

    fireEvent.click(get("viewer-header-back")!);
    fireEvent.click(get("viewer-header-dataset")!);
    expect(harness.close).toHaveBeenCalledTimes(2);
  });

  it("shows a grouped sample's slice", () => {
    harness.sample = { ...harness.sample, id: "group-1", slice: "left" };
    const get = renderHeader();

    expect(get("viewer-header-title")?.textContent).toBe("group-1");
    expect(get("viewer-header-slice")?.textContent).toBe("left");
  });

  it("steps with the host's stepper and disables a missing direction", () => {
    harness.sample = { ...harness.sample, hasPrevious: false };
    const get = renderHeader();

    const previous = get("nav-left-button") as HTMLButtonElement;
    const next = get("nav-right-button") as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    expect(stepper.next).toHaveBeenCalledTimes(1);
    expect(stepper.previous).not.toHaveBeenCalled();
  });

  it("shows the sample's position only when it is known", () => {
    expect(renderHeader()("viewer-header-position")).toBeNull();

    harness.sample = {
      ...harness.sample,
      position: { index: 1234, total: 5000 },
    };
    expect(renderHeader()("viewer-header-position")?.textContent).toBe(
      "1,234/5,000",
    );
  });

  it("drops the steppers for a lone sample", () => {
    harness.sample = { ...harness.sample, hasNext: false, hasPrevious: false };
    const get = renderHeader();

    expect(get("nav-left-button")).toBeNull();
    expect(get("nav-right-button")).toBeNull();
  });

  it("switches mode, and hides the switch when annotating is not offered", () => {
    const get = renderHeader();
    fireEvent.click(get("annotate")!);
    expect(mode.annotate).toHaveBeenCalled();

    const selected = (cy: string, annotating: boolean) =>
      renderHeader({ mode: { ...mode, annotating } })(cy)
        ?.closest("[role=tab]")
        ?.getAttribute("aria-selected");
    expect(selected("explore", false)).toBe("true");
    expect(selected("annotate", true)).toBe("true");

    const without = renderHeader({ mode: undefined });
    expect(without("annotate")).toBeNull();
    expect(without("explore")).toBeNull();
  });

  it("offers the sample's explore tools only while exploring", () => {
    harness.context = { exploring: true, group: true, multimodal: false };
    let get = renderHeader();
    for (const cy of [
      "action-manage-selected",
      "action-tag-sample-labels",
      "action-sort-by-similarity",
      "action-toggle-group-media-visibility",
      "placements-samples-viewer-actions",
      "action-browse-operations",
      "action-color-settings",
      "action-display-options",
    ]) {
      expect(get(cy), cy).not.toBeNull();
    }

    harness.context = { exploring: false, group: true, multimodal: false };
    get = renderHeader();
    for (const cy of [
      "action-manage-selected",
      "action-tag-sample-labels",
      "action-sort-by-similarity",
      "action-toggle-group-media-visibility",
    ]) {
      expect(get(cy), cy).toBeNull();
    }
    expect(get("placements-samples-viewer-actions")).not.toBeNull();
  });

  it("has no similarity search or sidebar toggle for multimodal", () => {
    harness.context = { exploring: true, group: false, multimodal: true };
    harness.sidebar = { available: false, visible: true };
    const get = renderHeader();

    expect(get("action-sort-by-similarity")).toBeNull();
    expect(get("action-toggle-sidebar")).toBeNull();
  });

  it("clears hidden labels, shown only while some are hidden", () => {
    expect(renderHeader()("action-clear-hidden-labels")).toBeNull();

    harness.hidden = 3;
    const get = renderHeader();
    const clear = get("action-clear-hidden-labels")!;
    expect(clear.textContent).toBe("3");
    fireEvent.click(clear);
    expect(harness.clearHidden).toHaveBeenCalled();
  });

  it("toggles fullscreen, the sidebar and the operator browser, and copies the link", () => {
    const get = renderHeader();

    fireEvent.click(get("action-toggle-fullscreen")!);
    fireEvent.click(get("action-toggle-sidebar")!);
    fireEvent.click(get("action-browse-operations")!);
    fireEvent.click(get("action-copy-sample-link")!);

    expect(harness.toggleFullscreen).toHaveBeenCalled();
    expect(harness.toggleSidebar).toHaveBeenCalled();
    expect(harness.toggleBrowser).toHaveBeenCalled();
    expect(harness.copyLink).toHaveBeenCalled();
  });

  it("opens the group visibility popout from its action", () => {
    harness.context = { exploring: true, group: true, multimodal: false };
    const get = renderHeader();
    const action = get("action-toggle-group-media-visibility")!;

    expect(get("group-media-visibility-popout")).toBeNull();
    fireEvent.click(action.querySelector("button")!);
    expect(get("group-media-visibility-popout")).not.toBeNull();
  });

  it("docks a host's utilities", () => {
    const get = renderHeader({ utilities: <div data-cy="host-utility" /> });
    expect(get("host-utility")).not.toBeNull();
  });
});
