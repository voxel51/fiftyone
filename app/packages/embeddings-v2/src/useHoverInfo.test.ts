// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HoverContent } from "./HoverCard";
import { fetchSampleInfo, type SampleInfo } from "./protocol";
import type { HoverHit } from "./renderer";
import { useHoverInfo } from "./useHoverInfo";

vi.mock("./protocol", () => ({ fetchSampleInfo: vi.fn() }));

const hit = (index: number): HoverHit => ({
  index,
  id: `id${index}`,
  label: "",
  x: 0,
  y: 0,
});

const info = (index: number): SampleInfo => ({
  id: `id${index}`,
  sampleId: `sample${index}`,
  filepath: `/data/nested/img${index}.jpg`,
  media: `media${index}.jpg`,
  value: `value${index}`,
});

const mediaUrl = (media: string) => `url:${media}`;

describe("useHoverInfo", () => {
  it("resolves sample info into hover content", async () => {
    vi.mocked(fetchSampleInfo).mockResolvedValue(info(1));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", "label", mediaUrl, () => "#abcdef"),
    );

    act(() => result.current.handleHover(hit(1)));

    await waitFor(() => expect(result.current.hover).not.toBeNull());
    expect(result.current.hover?.src).toBe("url:media1.jpg");
    // Value pairs with the point's rendered color; the filename is the
    // basename; ids never surface
    expect(result.current.hover?.value).toEqual({
      label: "value1",
      swatch: "#abcdef",
    });
    expect(result.current.hover?.filename).toBe("img1.jpg");
  });

  it("serves repeat hovers from the cache", async () => {
    vi.mocked(fetchSampleInfo).mockClear().mockResolvedValue(info(1));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl),
    );

    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(result.current.hover).not.toBeNull());
    act(() => result.current.handleHover(null));
    act(() => result.current.handleHover(hit(1)));

    await waitFor(() => expect(result.current.hover).not.toBeNull());
    expect(fetchSampleInfo).toHaveBeenCalledTimes(1);
  });

  it("drops info that resolves after the pointer moved on", async () => {
    let release!: (value: SampleInfo) => void;
    vi.mocked(fetchSampleInfo)
      .mockClear()
      .mockImplementationOnce(
        () => new Promise<SampleInfo>((res) => (release = res)),
      )
      .mockResolvedValueOnce(info(2));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl),
    );

    // Dwell out on point 1 so its fetch is genuinely in flight
    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(fetchSampleInfo).toHaveBeenCalledTimes(1));
    act(() => result.current.handleHover(hit(2)));
    await waitFor(() => expect(result.current.hover).not.toBeNull());

    act(() => release(info(1)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.hover?.hit.index).toBe(2);
  });

  // The dense-cloud contract: gliding across points is free — only the
  // point the pointer rests on gets fetched and carded
  it("fetches nothing for points crossed without dwelling", async () => {
    vi.mocked(fetchSampleInfo).mockClear().mockResolvedValue(info(3));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl),
    );

    act(() => result.current.handleHover(hit(1)));
    act(() => result.current.handleHover(hit(2)));
    act(() => result.current.handleHover(hit(3)));
    // The ring saw every point instantly, the card none of them
    expect(result.current.hoverHit?.index).toBe(3);
    expect(result.current.hover).toBeNull();

    await waitFor(() => expect(result.current.hover).not.toBeNull());
    expect(fetchSampleInfo).toHaveBeenCalledExactlyOnceWith(
      "ds",
      "viz",
      3,
      null,
    );
  });

  it("clears on hover-out", async () => {
    vi.mocked(fetchSampleInfo).mockResolvedValue(info(1));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl),
    );

    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(result.current.hover).not.toBeNull());
    // The card survives a short grace after the pointer leaves the point, so
    // the pointer can reach the card's own actions
    act(() => result.current.handleHover(null));
    await waitFor(() => expect(result.current.hover).toBeNull());
  });

  it("serves local detail synchronously without fetching sample info", async () => {
    vi.mocked(fetchSampleInfo).mockClear();
    const localContent: HoverContent = {
      hit: hit(1),
      src: null,
      value: { label: "local", swatch: null },
      filename: null,
    };
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl, undefined, () => localContent),
    );

    act(() => result.current.handleHover(hit(1)));

    expect(result.current.hover).toEqual(localContent);
    expect(fetchSampleInfo).not.toHaveBeenCalled();
  });

  it("keeps the card when the pointer enters it", async () => {
    vi.mocked(fetchSampleInfo).mockResolvedValue(info(1));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl),
    );

    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(result.current.hover).not.toBeNull());
    act(() => {
      result.current.handleHover(null);
      result.current.keepHover();
    });
    await new Promise((r) => setTimeout(r, 320));
    expect(result.current.hover).not.toBeNull();
  });

  // A camera move re-anchors the same point at new coords: a response
  // requested at the OLD position must not paint the card there (same
  // dataset/run/field/index — only the seq token can tell them apart)
  it("drops a response that resolves after the point re-anchors", async () => {
    let release!: (value: SampleInfo) => void;
    // The fallback is a persistent implementation, NOT a queued once: a
    // queued fallback this test never consumes would leak into the next
    // test's fetch queue
    vi.mocked(fetchSampleInfo)
      .mockClear()
      .mockImplementation(() => new Promise<SampleInfo>(() => undefined))
      .mockImplementationOnce(
        () => new Promise<SampleInfo>((res) => (release = res)),
      );
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl),
    );

    // Dwell out on point 1 so its fetch is genuinely in flight
    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(fetchSampleInfo).toHaveBeenCalledTimes(1));
    // Same index, new projected position (wheel zoom under a still pointer)
    act(() => result.current.handleHover({ ...hit(1), x: 30, y: 40 }));
    await act(async () => release(info(1)));
    expect(result.current.hover).toBeNull();
  });

  // Keyboard-driven color-by changes can land under a stationary
  // pointer: the card (whose value line shows the field) must drop, the
  // ring must stay, and the old field's in-flight response must die
  it("invalidates the card when the color field changes", async () => {
    let release!: (value: SampleInfo) => void;
    vi.mocked(fetchSampleInfo)
      .mockClear()
      .mockImplementationOnce(
        () => new Promise<SampleInfo>((res) => (release = res)),
      );
    const { result, rerender } = renderHook(
      ({ field }: { field: string | null }) =>
        useHoverInfo("ds", "viz", field, mediaUrl),
      { initialProps: { field: "label" as string | null } },
    );

    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(fetchSampleInfo).toHaveBeenCalledTimes(1));
    rerender({ field: "other" });
    await act(async () => release(info(1)));

    expect(result.current.hover).toBeNull();
    expect(result.current.hoverHit?.index).toBe(1);
  });

  // The guard must be the FULL request identity: same index, previous
  // run — the stale response used to land because only the index matched
  it("drops an in-flight response that resolves after a run change", async () => {
    let resolveInfo: (value: ReturnType<typeof info>) => void = () => undefined;
    vi.mocked(fetchSampleInfo)
      .mockClear()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveInfo = resolve)),
      );
    const { result, rerender } = renderHook(
      ({ brainKey }: { brainKey: string }) =>
        useHoverInfo("ds", brainKey, null, mediaUrl),
      { initialProps: { brainKey: "viz" } },
    );

    // Dwell out so the old run's fetch is genuinely in flight
    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(fetchSampleInfo).toHaveBeenCalledTimes(1));
    rerender({ brainKey: "viz2" });
    // Same index, new run: hover the new run's point 1 with a pending
    // fetch, then let the OLD run's response arrive
    vi.mocked(fetchSampleInfo).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(fetchSampleInfo).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveInfo(info(1));
    });
    expect(result.current.hover).toBeNull();
  });

  // A run switch mid-dwell: the pending timer and request key belong
  // to the old run and must die with it — no stale card, no fetch
  it("cancels a pending dwell when the run changes", async () => {
    vi.mocked(fetchSampleInfo).mockClear().mockResolvedValue(info(1));
    const { result, rerender } = renderHook(
      ({ brainKey }: { brainKey: string }) =>
        useHoverInfo("ds", brainKey, null, mediaUrl),
      { initialProps: { brainKey: "viz" } },
    );

    act(() => result.current.handleHover(hit(1)));
    rerender({ brainKey: "viz2" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(fetchSampleInfo).not.toHaveBeenCalled();
    expect(result.current.hover).toBeNull();
  });

  it("clears the card when the run changes", async () => {
    vi.mocked(fetchSampleInfo).mockResolvedValue(info(1));
    const { result, rerender } = renderHook(
      ({ brainKey }: { brainKey: string }) =>
        useHoverInfo("ds", brainKey, null, mediaUrl),
      { initialProps: { brainKey: "viz" } },
    );

    act(() => result.current.handleHover(hit(1)));
    await waitFor(() => expect(result.current.hover).not.toBeNull());

    rerender({ brainKey: "viz2" });
    expect(result.current.hover).toBeNull();
  });
});

describe("useHoverInfo: freezing the card", () => {
  /** Resident detail, so the card exists synchronously — the multimodal
   * path, and the one the freeze is for. */
  const detail = (h: HoverHit): HoverContent => ({
    hit: h,
    src: null,
    value: null,
    filename: null,
    header: { title: `ep${h.index}` },
  });

  const frozen = () => {
    const view = renderHook(
      ({ field, run }: { field: string | null; run: string }) =>
        useHoverInfo("ds", run, field, mediaUrl, undefined, detail),
      { initialProps: { field: "label" as string | null, run: "viz" } },
    );
    act(() => view.result.current.handleHover(hit(1)));
    act(() => view.result.current.pinHover());
    return view;
  };

  it("holds the card against every later hover", () => {
    // The reader is aiming at the card's own button; points crossed on the
    // way must not rewrite what they are aiming at
    const { result } = frozen();
    expect(result.current.pinned).toBe(true);

    act(() => result.current.handleHover(hit(2)));
    act(() => result.current.handleHover(null));

    expect(result.current.hover?.header?.title).toBe("ep1");
    expect(result.current.pinned).toBe(true);
  });

  it("freezes nothing when no card is showing", () => {
    // A click on empty space would otherwise lock the hover into a state
    // nothing can be read from and only Escape could leave
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", "label", mediaUrl, undefined, detail),
    );

    act(() => result.current.pinHover());

    expect(result.current.pinned).toBe(false);
    expect(result.current.hover).toBeNull();
  });

  it("rebuilds the card for the pin, and only for the pin", () => {
    // The click is the only place work too expensive for a hover belongs —
    // a seek and a decode per point crossed while gliding over a dense
    // cloud is exactly what this gate exists to prevent
    const localDetail = vi.fn(
      (h: HoverHit, pinned?: boolean): HoverContent => ({
        hit: h,
        src: null,
        value: null,
        filename: null,
        header: { title: pinned ? "pinned" : "hovered" },
      }),
    );
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", "label", mediaUrl, undefined, localDetail),
    );

    act(() => result.current.handleHover(hit(1)));
    expect(localDetail).toHaveBeenLastCalledWith(hit(1));
    expect(result.current.hover?.header?.title).toBe("hovered");

    act(() => result.current.pinHover());

    expect(localDetail).toHaveBeenLastCalledWith(hit(1), true);
    expect(result.current.hover?.header?.title).toBe("pinned");
  });

  it("asks for no pinned detail when nothing is showing", () => {
    const localDetail = vi.fn(() => null);
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", "label", mediaUrl, undefined, localDetail),
    );

    act(() => result.current.pinHover());

    expect(localDetail).not.toHaveBeenCalled();
  });

  it("re-rings the card's point even when the live hit was lost", () => {
    // Every pointerdown drops the hover, so this IS the click path: the ring
    // clears at once, the card stays up on its clear timer, and the pin lands
    // between the two — with nothing ringed unless it re-anchors
    const view = renderHook(
      ({ field, run }: { field: string | null; run: string }) =>
        useHoverInfo("ds", run, field, mediaUrl, undefined, detail),
      { initialProps: { field: "label" as string | null, run: "viz" } },
    );
    act(() => view.result.current.handleHover(hit(1)));
    act(() => view.result.current.handleHover(null));
    expect(view.result.current.hoverHit).toBeNull();

    act(() => view.result.current.pinHover());

    expect(view.result.current.hoverHit).toMatchObject({ index: 1 });
    expect(view.result.current.pinned).toBe(true);
  });

  it("follows its own point through a camera move", () => {
    // The ring is the only thing marking what was clicked; anchored to a
    // place rather than a point, it slides off the moment the reader pans
    const { result } = frozen();

    act(() => result.current.handleHover({ ...hit(1), x: 40, y: 50 }));

    expect(result.current.hoverHit).toMatchObject({ index: 1, x: 40, y: 50 });
    expect(result.current.hover?.hit).toMatchObject({ x: 40, y: 50 });
    expect(result.current.pinned).toBe(true);
  });

  it("releases on request, and hovers again after", () => {
    const { result } = frozen();

    act(() => result.current.unpinHover());
    expect(result.current.pinned).toBe(false);
    expect(result.current.hover).toBeNull();

    act(() => result.current.handleHover(hit(2)));
    expect(result.current.hover?.header?.title).toBe("ep2");
  });

  it.each([
    [
      "the run changes",
      (view: ReturnType<typeof frozen>) =>
        view.rerender({ field: "label", run: "viz2" }),
    ],
    [
      "the color field changes",
      (view: ReturnType<typeof frozen>) =>
        view.rerender({ field: "other", run: "viz" }),
    ],
  ])("releases when %s under it", (_name, change) => {
    // The card would otherwise go on describing a point the plot no longer
    // has, frozen where nothing can dislodge it
    const view = frozen();

    act(() => change(view));

    expect(view.result.current.pinned).toBe(false);
    expect(view.result.current.hover).toBeNull();
  });
});
