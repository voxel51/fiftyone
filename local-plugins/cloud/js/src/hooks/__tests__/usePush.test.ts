/**
 * `usePush`: the merge rule and the auto-confirm, the two places where the
 * frontend makes a decision rather than rendering one.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  PanelData,
  PushData,
  PushMode,
  PushStatus,
  PushTarget,
} from "../../types";
import { AUTO_CONFIRM_FILE_LIMIT, usePush } from "../usePush";
import { fakeEventSource, fakeExecutor, pushData, schemaView } from "./fakes";

const RESET = () => Promise.resolve();

function render(
  initial: PanelData = {},
  overrides: { hasView?: boolean } = {},
) {
  const executor = fakeExecutor();
  const source = fakeEventSource();
  const view = schemaView({ has_view: overrides.hasView ?? false });

  const rendered = renderHook(
    ({ data }: { data: PanelData }) =>
      usePush(data, view, RESET, {
        executor,
        panelId: "panel-7",
        datasetId: "ds-1",
        datasetName: "local-dataset",
        connect: source.connect,
      }),
    { initialProps: { data: initial } },
  );

  return { executor, source, view, ...rendered };
}

function preview(overrides: Partial<PushData["preview"]> = {}): PushData {
  return pushData({
    status: PushStatus.Preview,
    dataset_name: "cloud-ds",
    plan_token: "tok-1",
    preview: {
      samples: 4,
      files: 4,
      total_bytes: 100,
      missing: 0,
      ...overrides,
    },
  });
}

function stamped(seconds: number): string {
  return new Date(1_700_000_000_000 + seconds * 1000).toISOString();
}

describe("merge rule", () => {
  it("lets panel data own push while a local execution is in flight", () => {
    const { executor, source, result, rerender } = render({
      push: pushData({ status: PushStatus.Running, done: 5, total: 10 }),
    });

    act(() => {
      executor.setExecuting(true);
    });
    rerender({
      data: {
        push: pushData({
          status: PushStatus.Running,
          done: 5,
          total: 10,
          updated_at: stamped(0),
        }),
      },
    });

    // The store polls every ~5 s under OSS's default mongod; applying this
    // would visibly rewind the bar.
    act(() =>
      source.emit(
        "push",
        pushData({
          status: PushStatus.Running,
          done: 2,
          total: 10,
          updated_at: stamped(60),
        }),
      ),
    );

    expect(result.current.push.done).toBe(5);
  });

  it("applies store frames when nothing is executing locally", () => {
    const { source, result } = render({
      push: pushData({
        status: PushStatus.Running,
        done: 5,
        total: 10,
        updated_at: stamped(0),
      }),
    });

    // This is how a reopened panel picks up a running upload.
    act(() =>
      source.emit(
        "push",
        pushData({
          status: PushStatus.Running,
          done: 9,
          total: 10,
          updated_at: stamped(10),
        }),
      ),
    );

    expect(result.current.push.done).toBe(9);
  });

  it("never rewinds to an older store frame", () => {
    const { source, result } = render({
      push: pushData({
        status: PushStatus.Running,
        done: 9,
        total: 10,
        updated_at: stamped(10),
      }),
    });

    act(() =>
      source.emit(
        "push",
        pushData({
          status: PushStatus.Running,
          done: 2,
          updated_at: stamped(0),
        }),
      ),
    );

    expect(result.current.push.done).toBe(9);
  });

  it("ignores store frames for keys other than push", () => {
    const { source, result } = render({
      push: pushData({ status: PushStatus.Idle }),
    });

    act(() =>
      source.emit("something_else", pushData({ status: PushStatus.Done })),
    );

    expect(result.current.push.status).toBe(PushStatus.Idle);
  });
});

describe("auto-confirm", () => {
  it("confirms immediately when there is nothing to decide", () => {
    const { executor } = render({ push: preview() });

    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]).toMatchObject({
      mode: PushMode.Push,
      plan_token: "tok-1",
      fresh: false,
    });
  });

  it("shows the preview when media is missing", () => {
    const { executor, result } = render({ push: preview({ missing: 3 }) });

    expect(executor.calls).toHaveLength(0);
    expect(result.current.push.status).toBe(PushStatus.Preview);
  });

  it("shows the preview when a partial upload can resume", () => {
    const { executor } = render({
      push: pushData({
        ...preview(),
        resumable: { uploaded: 412, total: 900 },
      }),
    });

    // The start-over choice is the user's, never inferred.
    expect(executor.calls).toHaveLength(0);
  });

  it("shows the preview for a large job", () => {
    const { executor } = render({
      push: preview({ files: AUTO_CONFIRM_FILE_LIMIT }),
    });

    expect(executor.calls).toHaveLength(0);
  });

  it("fires at most once per plan token", () => {
    const { executor, rerender } = render({ push: preview() });

    rerender({ data: { push: preview() } });
    rerender({ data: { push: preview() } });

    // The guard is the token, not the status: the preview snapshot stays in
    // panel data across every re-render.
    expect(executor.calls).toHaveLength(1);
  });

  it("ignores a preview that arrived from another browser", () => {
    const { executor, source, result } = render({});

    // `_preview` emits through the composite sink, so a second tab on the
    // same dataset receives this over SSE. Acting on it would race for a
    // single-use plan token and could start a second worker.
    act(() => source.emit("push", { ...preview(), updated_at: stamped(10) }));

    expect(result.current.push.status).toBe(PushStatus.Preview);
    expect(executor.calls).toHaveLength(0);
  });

  it("does not re-fire after the user goes back", () => {
    const { executor, result } = render({ push: preview({ missing: 2 }) });

    act(() => result.current.back());

    expect(executor.calls).toHaveLength(0);
    expect(result.current.push.status).toBe(PushStatus.Idle);
  });
});

describe("params", () => {
  it("sends panel_id, target and cloud dataset name on every call", () => {
    const { executor, result } = render({}, { hasView: true });

    act(() => result.current.setDatasetName("renamed"));
    act(() => result.current.preview());

    expect(executor.calls[0]).toEqual({
      mode: PushMode.Preview,
      target: PushTarget.View,
      dataset_name: "renamed",
      panel_id: "panel-7",
      fresh: false,
    });
  });

  it("defaults the target to the dataset when no view is active", () => {
    const { executor, result } = render({});

    act(() => result.current.preview());

    expect(executor.calls[0].target).toBe(PushTarget.Dataset);
  });

  it("sends fresh only from the start-over checkbox", () => {
    const { executor, result } = render({ push: preview({ missing: 1 }) });

    act(() => result.current.confirm({ fresh: false }));
    act(() => result.current.confirm({ fresh: true }));

    expect(executor.calls[0].fresh).toBe(false);
    expect(executor.calls[1].fresh).toBe(true);
    expect(executor.calls[1].plan_token).toBe("tok-1");
  });
});

describe("subscription", () => {
  it("subscribes to the cloud_push store for this dataset", () => {
    const { source } = render({});

    expect(source.bodies[0]).toMatchObject({
      operator_uri: "@voxel51/cloud/cloud_push_subscription",
      dataset_id: "ds-1",
    });
  });

  it("drops the store override when a new run starts", () => {
    const { source, result } = render({});

    act(() =>
      source.emit(
        "push",
        pushData({ status: PushStatus.Done, updated_at: stamped(10) }),
      ),
    );
    expect(result.current.push.status).toBe(PushStatus.Done);

    act(() => result.current.preview());

    expect(result.current.push.status).toBe(PushStatus.Idle);
  });
});

describe("selection", () => {
  it("seeds the cloud name from the local dataset", () => {
    const { result } = render({});

    expect(result.current.selection.datasetName).toBe("local-dataset");
  });

  it("keeps a typed name across re-renders", () => {
    const { result, rerender } = render({});

    act(() => result.current.setDatasetName("mine"));
    rerender({ data: { push: pushData({}) } });

    expect(result.current.selection.datasetName).toBe("mine");
  });
});

// Silence the console.warn the subscription uses for malformed frames; none
// of these tests produce one, but a stray warning would be noise.
vi.spyOn(console, "warn").mockImplementation(() => {});
