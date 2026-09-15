import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import { type GridSelectionActionContext } from "@fiftyone/multimodal/extensions/grid-selection";
import { addToSubsetAction } from "./SubsetAction";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  subsetRequest: request,
}));

beforeAll(() => {
  // jsdom has no native dialog lifecycle; keep its open state visible to the test.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

function Host({ context }: { context: GridSelectionActionContext }) {
  return (
    <addToSubsetAction.Component context={context} disabledReason={null} />
  );
}

it("retries the captured members and operation after scope changes and partial failures", async () => {
  const original = [{ episodeId: "original", kind: "episode" as const }];
  const counts = {
    episodes: 1,
    fullEpisodes: 1,
    segments: 0,
    segmentEpisodes: 0,
    unavailable: 0,
  };
  let previewAttempt = 0,
    applyAttempt = 0;
  request.mockImplementation(
    async (
      _dataset: string,
      path: string,
      body?: { phase: string; operationId: string },
    ) => {
      if (!path) return { subsets: [{ id: "subset", name: "Review", counts }] };
      if (body?.phase === "prepare" && ++previewAttempt === 1)
        throw new Error("Preview interrupted");
      if (body?.phase === "apply" && ++applyAttempt === 1)
        throw new Error("Add interrupted");
      return {
        operationId: body?.operationId,
        subsetId: "subset",
        counts,
        added: 1,
        duplicates: 0,
        provenanceUpdated: 0,
      };
    },
  );
  const resolve = vi.fn(async () => original);
  const context: GridSelectionActionContext = {
    datasetId: "dataset",
    mediaType: "video",
    source: "explicit",
    counts,
    groups: [{ episodeId: "original", members: original }],
    loading: false,
    error: null,
    boundary: {},
    resolve,
  };
  const view = render(<Host context={context} />);
  fireEvent.click(await screen.findByText("Add to subset"));
  await screen.findByRole("dialog");
  view.rerender(
    <Host
      context={{
        ...context,
        source: "results",
        resolve: async () => [{ episodeId: "new-result", kind: "episode" }],
      }}
    />,
  );
  fireEvent.click(await screen.findByText(/Review ·/));
  fireEvent.click(await screen.findByText("Retry preview"));
  fireEvent.click(await screen.findByText("Add captured members"));
  fireEvent.click(await screen.findByText("Retry captured add"));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Added 1 new members",
    ),
  );
  const prepares = request.mock.calls.filter(
    (call) => call[2]?.phase === "prepare",
  );
  const applies = request.mock.calls.filter(
    (call) => call[2]?.phase === "apply",
  );
  expect(prepares).toHaveLength(2);
  expect(applies).toHaveLength(2);
  expect(prepares[0][2]).toEqual(prepares[1][2]);
  expect(prepares[0][2].members).toEqual(original);
  expect(applies[0][2]).toEqual(applies[1][2]);
  expect(applies[0][2].operationId).toBe(prepares[0][2].operationId);
  expect(resolve).toHaveBeenCalledOnce();
  act(() => view.unmount());
});
