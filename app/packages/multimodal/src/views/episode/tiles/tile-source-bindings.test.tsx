import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createStore, Provider as JotaiProvider, useAtomValue } from "jotai";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import {
  chooseNextImageStream,
  hoveredImageStreamAtom,
  persistedImageTileBindingsAtom,
  resolveAvailableImageStream,
  useImageTileBindings,
  useImageTileHoverProps,
  usePersistImageTileBinding,
  usePublishImageTileBinding,
} from "./tile-source-bindings";

function imageSource(id: string): SceneSource {
  return { id, label: id.toUpperCase(), sourceName: id, type: "image" };
}

describe("chooseNextImageStream", () => {
  const ranked = [
    imageSource("cam_front"),
    imageSource("cam_back"),
    imageSource("cam_left"),
  ];

  it("picks the best-ranked source not already displayed", () => {
    expect(chooseNextImageStream(ranked, {})).toBe("cam_front");
    expect(chooseNextImageStream(ranked, { "image-1": "cam_front" })).toBe(
      "cam_back",
    );
    expect(
      chooseNextImageStream(ranked, {
        "image-1": "cam_front",
        "image-2": "cam_back",
      }),
    ).toBe("cam_left");
  });

  it("falls back to the top-ranked source when every stream is on screen", () => {
    expect(
      chooseNextImageStream(ranked, {
        "image-1": "cam_front",
        "image-2": "cam_back",
        "image-3": "cam_left",
      }),
    ).toBe("cam_front");
  });

  it("returns the empty string without any sources", () => {
    expect(chooseNextImageStream([], {})).toBe("");
  });
});

describe("resolveAvailableImageStream", () => {
  const front = imageSource("cam_front");
  const back = imageSource("cam_back");

  it("temporarily falls back without forgetting a returning preference", () => {
    const fallback = resolveAvailableImageStream(
      "cam_back",
      "cam_back",
      [front],
      [front],
      {},
    );
    expect(fallback).toBe("cam_front");

    expect(
      resolveAvailableImageStream(
        fallback,
        "cam_back",
        [front, back],
        [front, back],
        {},
      ),
    ).toBe("cam_back");
  });

  it("keeps an available current fallback while the preference is absent", () => {
    expect(
      resolveAvailableImageStream(
        "cam_front",
        "cam_back",
        [front],
        [front],
        {},
      ),
    ).toBe("cam_front");
  });
});

const Publisher: React.FC<{ readonly sourceId: string }> = ({ sourceId }) => {
  usePublishImageTileBinding(sourceId);
  return null;
};

const BindingsProbe: React.FC = () => (
  <span data-testid="bindings">{JSON.stringify(useImageTileBindings())}</span>
);

const PersistedBindingsProbe: React.FC = () => (
  <span data-testid="persisted-bindings">
    {JSON.stringify(useAtomValue(persistedImageTileBindingsAtom))}
  </span>
);

const PreferencePublisher: React.FC<{
  readonly selectedSourceId?: string;
  readonly sourceId: string;
}> = ({ selectedSourceId, sourceId }) => {
  const persistBinding = usePersistImageTileBinding(sourceId);
  usePublishImageTileBinding(sourceId);
  React.useEffect(() => {
    if (selectedSourceId) persistBinding(selectedSourceId);
  }, [persistBinding, selectedSourceId]);
  return null;
};

describe("usePublishImageTileBinding", () => {
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

describe("usePersistImageTileBinding", () => {
  afterEach(() => cleanup());

  it("persists creation and selection but not transient fallback or teardown", () => {
    const view = render(
      <TilingProvider>
        <TileIdScope tileId="image-1">
          <PreferencePublisher sourceId="cam_back" />
        </TileIdScope>
        <BindingsProbe />
        <PersistedBindingsProbe />
      </TilingProvider>,
    );
    expect(screen.getByTestId("persisted-bindings").textContent).toBe(
      '{"image-1":"cam_back"}',
    );

    view.rerender(
      <TilingProvider>
        <TileIdScope tileId="image-1">
          <PreferencePublisher sourceId="cam_front" />
        </TileIdScope>
        <BindingsProbe />
        <PersistedBindingsProbe />
      </TilingProvider>,
    );
    expect(screen.getByTestId("bindings").textContent).toBe(
      '{"image-1":"cam_front"}',
    );
    expect(screen.getByTestId("persisted-bindings").textContent).toBe(
      '{"image-1":"cam_back"}',
    );

    view.rerender(
      <TilingProvider>
        <TileIdScope tileId="image-1">
          <PreferencePublisher
            selectedSourceId="cam_front"
            sourceId="cam_front"
          />
        </TileIdScope>
        <BindingsProbe />
        <PersistedBindingsProbe />
      </TilingProvider>,
    );
    expect(screen.getByTestId("persisted-bindings").textContent).toBe(
      '{"image-1":"cam_front"}',
    );

    view.rerender(
      <TilingProvider>
        <BindingsProbe />
        <PersistedBindingsProbe />
      </TilingProvider>,
    );
    expect(screen.getByTestId("bindings").textContent).toBe("{}");
    expect(screen.getByTestId("persisted-bindings").textContent).toBe(
      '{"image-1":"cam_front"}',
    );
  });
});

describe("useImageTileHoverProps", () => {
  it("publishes hover on enter and clears its own hover on leave", () => {
    const store = createStore();
    const { result } = renderHook(() => useImageTileHoverProps("cam_front"), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    act(() => result.current.onPointerEnter());
    expect(store.get(hoveredImageStreamAtom)).toBe("cam_front");

    act(() => result.current.onPointerLeave());
    expect(store.get(hoveredImageStreamAtom)).toBeNull();
  });

  it("does not clear another tile's hover, and cleans up on unmount", () => {
    const store = createStore();
    const { result, unmount } = renderHook(
      () => useImageTileHoverProps("cam_front"),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <JotaiProvider store={store}>{children}</JotaiProvider>
        ),
      },
    );

    store.set(hoveredImageStreamAtom, "cam_back");
    act(() => result.current.onPointerLeave());
    expect(store.get(hoveredImageStreamAtom)).toBe("cam_back");

    act(() => result.current.onPointerEnter());
    unmount();
    expect(store.get(hoveredImageStreamAtom)).toBeNull();
  });
});
