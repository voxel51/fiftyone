// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  filepath: null,
  media: `media${index}.jpg`,
  value: `value${index}`,
});

const mediaUrl = (media: string) => `url:${media}`;

describe("useHoverInfo", () => {
  it("resolves sample info into hover content", async () => {
    vi.mocked(fetchSampleInfo).mockResolvedValue(info(1));
    const { result } = renderHook(() =>
      useHoverInfo("ds", "viz", "label", mediaUrl),
    );

    act(() => result.current.handleHover(hit(1)));

    await waitFor(() => expect(result.current.hover).not.toBeNull());
    expect(result.current.hover?.src).toBe("url:media1.jpg");
    expect(result.current.hover?.lines).toEqual(["value1", "sample1"]);
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
    act(() => result.current.handleHover(null));
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
