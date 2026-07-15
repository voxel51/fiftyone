import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import {
  chooseNextImageTopic,
  mcapHoveredImageTopicAtom,
  useMcapImageTileBindings,
  useMcapImageTileHoverProps,
  usePublishMcapImageTileBinding,
} from "./mcap-tile-source-bindings";

function imageSource(id: string): SceneSource {
  return { id, label: id.toUpperCase(), type: "image" };
}

describe("chooseNextImageTopic", () => {
  const ranked = [
    imageSource("cam_front"),
    imageSource("cam_back"),
    imageSource("cam_left"),
  ];

  it("picks the best-ranked source not already displayed", () => {
    expect(chooseNextImageTopic(ranked, {})).toBe("cam_front");
    expect(chooseNextImageTopic(ranked, { "image-1": "cam_front" })).toBe(
      "cam_back",
    );
    expect(
      chooseNextImageTopic(ranked, {
        "image-1": "cam_front",
        "image-2": "cam_back",
      }),
    ).toBe("cam_left");
  });

  it("falls back to the top-ranked source when every stream is on screen", () => {
    expect(
      chooseNextImageTopic(ranked, {
        "image-1": "cam_front",
        "image-2": "cam_back",
        "image-3": "cam_left",
      }),
    ).toBe("cam_front");
  });

  it("returns the empty string without any sources", () => {
    expect(chooseNextImageTopic([], {})).toBe("");
  });
});

const Publisher: React.FC<{ readonly sourceId: string }> = ({ sourceId }) => {
  usePublishMcapImageTileBinding(sourceId);
  return null;
};

const BindingsProbe: React.FC = () => (
  <span data-testid="bindings">
    {JSON.stringify(useMcapImageTileBindings())}
  </span>
);

describe("usePublishMcapImageTileBinding", () => {
  afterEach(() => cleanup());

  function renderPublisher(sourceId: string) {
    return render(
      <TilingProvider>
        <TileIdScope tileId="image-1">
          <Publisher sourceId={sourceId} />
        </TileIdScope>
        <BindingsProbe />
      </TilingProvider>,
    );
  }

  it("publishes while mounted, tracks rebinds, and cleans up on unmount", () => {
    const view = renderPublisher("cam_front");
    expect(screen.getByTestId("bindings").textContent).toBe(
      '{"image-1":"cam_front"}',
    );

    view.rerender(
      <TilingProvider>
        <TileIdScope tileId="image-1">
          <Publisher sourceId="cam_back" />
        </TileIdScope>
        <BindingsProbe />
      </TilingProvider>,
    );
    expect(screen.getByTestId("bindings").textContent).toBe(
      '{"image-1":"cam_back"}',
    );

    view.rerender(
      <TilingProvider>
        <BindingsProbe />
      </TilingProvider>,
    );
    expect(screen.getByTestId("bindings").textContent).toBe("{}");
  });

  it("publishes nothing for an empty source id", () => {
    renderPublisher("");
    expect(screen.getByTestId("bindings").textContent).toBe("{}");
  });
});

describe("useMcapImageTileHoverProps", () => {
  it("publishes hover on enter and clears its own hover on leave", () => {
    const store = createStore();
    const { result } = renderHook(
      () => useMcapImageTileHoverProps("cam_front"),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <JotaiProvider store={store}>{children}</JotaiProvider>
        ),
      },
    );

    act(() => result.current.onPointerEnter());
    expect(store.get(mcapHoveredImageTopicAtom)).toBe("cam_front");

    act(() => result.current.onPointerLeave());
    expect(store.get(mcapHoveredImageTopicAtom)).toBeNull();
  });

  it("does not clear another tile's hover, and cleans up on unmount", () => {
    const store = createStore();
    const { result, unmount } = renderHook(
      () => useMcapImageTileHoverProps("cam_front"),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <JotaiProvider store={store}>{children}</JotaiProvider>
        ),
      },
    );

    store.set(mcapHoveredImageTopicAtom, "cam_back");
    act(() => result.current.onPointerLeave());
    expect(store.get(mcapHoveredImageTopicAtom)).toBe("cam_back");

    act(() => result.current.onPointerEnter());
    unmount();
    expect(store.get(mcapHoveredImageTopicAtom)).toBeNull();
  });
});
