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
      .mockImplementationOnce(
        () => new Promise<SampleInfo>((res) => (release = res)),
      )
      .mockResolvedValueOnce(info(2));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", null, mediaUrl),
    );

    act(() => result.current.handleHover(hit(1)));
    act(() => result.current.handleHover(hit(2)));
    await waitFor(() => expect(result.current.hover).not.toBeNull());

    act(() => release(info(1)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.hover?.hit.index).toBe(2);
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

  // The guard must be the FULL request identity: same index, previous
  // run — the stale response used to land because only the index matched
  it("drops an in-flight response that resolves after a run change", async () => {
    let resolveInfo: (value: ReturnType<typeof info>) => void = () => undefined;
    vi.mocked(fetchSampleInfo).mockImplementationOnce(
      () => new Promise((resolve) => (resolveInfo = resolve)),
    );
    const { result, rerender } = renderHook(
      ({ brainKey }: { brainKey: string }) =>
        useHoverInfo("ds", brainKey, null, mediaUrl),
      { initialProps: { brainKey: "viz" } },
    );

    act(() => result.current.handleHover(hit(1)));
    rerender({ brainKey: "viz2" });
    // Same index, new run: hover the new run's point 1 with a pending
    // fetch, then let the OLD run's response arrive
    vi.mocked(fetchSampleInfo).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    act(() => result.current.handleHover(hit(1)));
    await act(async () => {
      resolveInfo(info(1));
    });
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
