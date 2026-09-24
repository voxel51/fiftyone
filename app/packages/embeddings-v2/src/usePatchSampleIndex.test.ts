// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchIds, idAt, type IdColumn } from "./protocol";
import { usePatchSampleIndex } from "./usePatchSampleIndex";

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => {
    throw new Error("network use in a unit test");
  },
}));
vi.mock("./protocol", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./protocol")>()),
  fetchIds: vi.fn(),
}));

const oid = (byte: number): Uint8Array => new Uint8Array(12).fill(byte);
const idColumn = (...ids: Uint8Array[]): IdColumn => {
  const out = new Uint8Array(ids.length * 12);
  ids.forEach((id, i) => out.set(id, i * 12));
  return out;
};
const hex = (byte: number): string => idAt(oid(byte), 0);

// Points 0 and 1 are patches of sample 1, point 2 a patch of sample 2
const OWNERS = idColumn(oid(1), oid(1), oid(2));

const deferred = () => {
  let resolve: (ids: IdColumn) => void = () => undefined;
  const promise = new Promise<IdColumn>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

interface Props {
  brainKey: string;
  patchesField: string | null;
  enabled: boolean;
}

const render = (initialProps: Props) =>
  renderHook(
    ({ brainKey, patchesField, enabled }: Props) =>
      usePatchSampleIndex("ds", brainKey, patchesField, enabled),
    { initialProps },
  );

describe("usePatchSampleIndex", () => {
  beforeEach(() => {
    vi.mocked(fetchIds).mockReset();
    vi.mocked(fetchIds).mockResolvedValue(OWNERS);
  });

  it("fetches nothing until something needs it", () => {
    const { result } = render({
      brainKey: "viz",
      patchesField: "ground_truth",
      enabled: false,
    });

    expect(fetchIds).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("fetches nothing for a samples run", () => {
    const { result } = render({
      brainKey: "viz",
      patchesField: null,
      enabled: true,
    });

    expect(fetchIds).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("indexes each sample to every point it owns", async () => {
    const { result } = render({
      brainKey: "viz",
      patchesField: "ground_truth",
      enabled: true,
    });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(fetchIds).toHaveBeenCalledWith("ds", "viz", undefined, "samples");
    expect(result.current?.get(hex(1))).toEqual([0, 1]);
    expect(result.current?.get(hex(2))).toEqual([2]);
  });

  it("fetches once per run, however often the selection comes and goes", async () => {
    const props: Props = {
      brainKey: "viz",
      patchesField: "ground_truth",
      enabled: true,
    };
    const { result, rerender } = render(props);
    await waitFor(() => expect(result.current).not.toBeNull());

    rerender({ ...props, enabled: false });
    rerender({ ...props, enabled: true });

    expect(fetchIds).toHaveBeenCalledTimes(1);
    expect(result.current?.get(hex(1))).toEqual([0, 1]);
  });

  it("keeps a response that lands after the selection cleared", async () => {
    // Clearing mid-fetch must not orphan the result: the run would stay
    // marked as fetching with no index, and never ask again
    const pending = deferred();
    vi.mocked(fetchIds).mockReturnValueOnce(pending.promise);
    const props: Props = {
      brainKey: "viz",
      patchesField: "ground_truth",
      enabled: true,
    };
    const { result, rerender } = render(props);

    rerender({ ...props, enabled: false });
    pending.resolve(OWNERS);
    await waitFor(() => expect(result.current).not.toBeNull());

    rerender({ ...props, enabled: true });
    expect(fetchIds).toHaveBeenCalledTimes(1);
    expect(result.current?.get(hex(2))).toEqual([2]);
  });

  it("drops a response for a run the plot has left", async () => {
    const stale = deferred();
    vi.mocked(fetchIds)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(idColumn(oid(3)));
    const { result, rerender } = render({
      brainKey: "viz",
      patchesField: "ground_truth",
      enabled: true,
    });

    rerender({
      brainKey: "other",
      patchesField: "ground_truth",
      enabled: true,
    });
    await waitFor(() => expect(result.current?.get(hex(3))).toEqual([0]));

    // Inside act, so a wrongly accepted response would commit before the
    // assertions and fail them
    await act(async () => {
      stale.resolve(OWNERS);
      await stale.promise;
    });
    expect(result.current?.get(hex(1))).toBeUndefined();
    expect(result.current?.get(hex(3))).toEqual([0]);
  });
});
