// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmbeddingsV2Panel from "./EmbeddingsV2Panel";
import { fetchRunsStatus } from "./protocol";

const panel = vi.hoisted(() => ({
  openKey: null as string | null,
  runs: [] as Array<Record<string, unknown>>,
  refresh: (() => undefined) as () => void,
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "ds",
  useCurrentDatasetId: () => "ds-id",
  useRefresh: () => panel.refresh,
}));
vi.mock("@fiftyone/spaces", () => ({
  usePanelStatePartial: (key: string) => [
    key === "brainResult" ? panel.openKey : null,
    vi.fn(),
  ],
}));
vi.mock("@fiftyone/operators", () => ({
  useOperatorExecutor: () => ({ execute: vi.fn() }),
  usePendingRuns: () => ({ runs: [], loaded: true }),
}));
vi.mock("./extensions", () => ({ useExtensionGeneration: () => 0 }));
vi.mock("./useClearSelectionOnClose", () => ({
  useClearSelectionOnClose: () => undefined,
}));
vi.mock("./useVisualizationRuns", () => ({
  useVisualizationRuns: () => ({ runs: panel.runs }),
}));
vi.mock("./PlotView", () => ({ default: () => <div>plot</div> }));
vi.mock("./RunsList", () => ({ default: () => <div>list</div> }));
vi.mock("./protocol", () => ({ fetchRunsStatus: vi.fn() }));

const RUN = { brainKey: "viz", ready: true, error: null };
const POLL_MS = 5_000;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("EmbeddingsV2Panel runs polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    panel.runs = [RUN];
    panel.refresh = vi.fn();
    vi.mocked(fetchRunsStatus).mockResolvedValue([RUN]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("checks once when opened on a plot, and never polls there", async () => {
    panel.openKey = "viz";
    render(<EmbeddingsV2Panel />);
    await advance(0);
    expect(fetchRunsStatus).toHaveBeenCalledTimes(1);

    await advance(POLL_MS * 3);
    expect(fetchRunsStatus).toHaveBeenCalledTimes(1);
  });

  it("checks once when opened on the list, then polls while it shows", async () => {
    panel.openKey = null;
    render(<EmbeddingsV2Panel />);
    await advance(0);
    expect(fetchRunsStatus).toHaveBeenCalledTimes(1);

    await advance(POLL_MS * 2);
    expect(fetchRunsStatus).toHaveBeenCalledTimes(3);
  });

  it("stops polling when a plot opens from the list", async () => {
    panel.openKey = null;
    const { rerender } = render(<EmbeddingsV2Panel />);
    await advance(POLL_MS);
    expect(fetchRunsStatus).toHaveBeenCalledTimes(2);

    panel.openKey = "viz";
    rerender(<EmbeddingsV2Panel />);
    await advance(POLL_MS * 3);
    expect(fetchRunsStatus).toHaveBeenCalledTimes(2);
  });

  it("reloads the dataset when the server's runs differ", async () => {
    // A run that registered after the page loaded its dataset
    panel.openKey = null;
    vi.mocked(fetchRunsStatus).mockResolvedValue([
      RUN,
      { brainKey: "new", ready: true, error: null },
    ]);
    render(<EmbeddingsV2Panel />);
    await advance(0);
    expect(panel.refresh).toHaveBeenCalledTimes(1);
  });
});
