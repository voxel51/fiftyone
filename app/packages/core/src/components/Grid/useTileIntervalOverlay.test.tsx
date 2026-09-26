import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", () => ({
  supportsTemporalTags: () => ({ key: "test_supportsTemporalTags" }),
  useCurrentDataset: () => ({ datasetId: "dataset" }),
}));

vi.mock("recoil", async () => ({
  ...(await vi.importActual<typeof import("recoil")>("recoil")),
  useRecoilBridgeAcrossReactRoots_UNSTABLE:
    () =>
    ({ children }: { children: ReactNode }) => <>{children}</>,
  useRecoilValue: () => true,
}));

const lane = vi.hoisted(() => ({ surfaces: [] as string[] }));

vi.mock("@fiftyone/multimodal/grid-overlay", () => ({
  EpisodeGridOverlay: ({ ctx }: { ctx: { surface: string } }) => {
    lane.surfaces.push(ctx.surface);
    return <div data-lane="" />;
  },
}));

import { useTileIntervalOverlay } from "./useTileIntervalOverlay";

describe("useTileIntervalOverlay", () => {
  it("mounts a lane on a video tile and not on an image tile", async () => {
    const { result } = renderHook(() => useTileIntervalOverlay());
    const show = async (mediaType: string) => {
      const element = document.createElement("div");
      await act(async () =>
        result.current.mount(mediaType, element, {
          sample: { _id: mediaType, _media_type: mediaType },
        }),
      );
      return element.querySelector("[data-lane]") !== null;
    };

    expect(await show("video")).toBe(true);
    expect(await show("image")).toBe(false);
  });

  it("tells the lane it is drawn on a grid tile", async () => {
    lane.surfaces = [];
    const { result } = renderHook(() => useTileIntervalOverlay());
    await act(async () =>
      result.current.mount("video", document.createElement("div"), {
        sample: { _id: "video", _media_type: "video" },
      }),
    );

    expect(lane.surfaces).toEqual(["grid"]);
  });
});
