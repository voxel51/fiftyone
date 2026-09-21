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
  readSidebarPreferences,
  updateSidebarPreferences,
} from "../settings/sidebar-preferences";
import { semanticSourceKey } from "../settings/semantic-source";
import {
  chooseNextImageStream,
  hoveredImageStreamAtom,
  persistedAudioTileBindingsAtom,
  persistedImageTileBindingsAtom,
  resolveAvailableAudioStream,
  resolveAvailableImageStream,
  useImageTileBindings,
  useImageTileHoverProps,
  usePersistAudioTileBinding,
  usePersistImageTileBinding,
  usePreferredAudioTileStream,
  usePreferredImageTileStream,
  usePublishImageTileBinding,
} from "./tile-source-bindings";
import { PanelVisibilityProvider } from "./panel-visibility";

function imageSource(id: string): SceneSource {
  return { id, label: id.toUpperCase(), sourceName: id, type: "image" };
}

function audioSource(id: string, sourceName: string): SceneSource {
  return { id, label: sourceName, sourceName, type: "audio" };
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

const PreferredBindingProbe: React.FC = () => (
  <span data-testid="preferred-binding">
    {usePreferredImageTileStream() ?? ""}
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
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

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

  it("restores the semantic image binding after runtime ids change", () => {
    const firstSource = {
      ...imageSource("10"),
      sourceName: "/camera/front",
    };
    const first = render(
      <PanelVisibilityProvider scopeKey="dataset-a" sources={[firstSource]}>
        <TilingProvider>
          <TileIdScope tileId="image-1">
            <PreferencePublisher sourceId="10" />
            <PreferredBindingProbe />
          </TileIdScope>
          <PersistedBindingsProbe />
        </TilingProvider>
      </PanelVisibilityProvider>,
    );
    expect(screen.getByTestId("persisted-bindings").textContent).toBe(
      '{"image-1":"10"}',
    );
    expect(screen.getByTestId("preferred-binding").textContent).toBe("10");
    first.unmount();

    const shiftedSource = { ...firstSource, id: "80" };
    const shifted = render(
      <PanelVisibilityProvider scopeKey="dataset-a" sources={[shiftedSource]}>
        <TilingProvider>
          <TileIdScope tileId="image-1">
            <PreferencePublisher sourceId="80" />
            <PreferredBindingProbe />
          </TileIdScope>
          <PersistedBindingsProbe />
        </TilingProvider>
      </PanelVisibilityProvider>,
    );
    expect(screen.getByTestId("persisted-bindings").textContent).toBe(
      '{"image-1":"80"}',
    );
    expect(screen.getByTestId("preferred-binding").textContent).toBe("80");
    shifted.unmount();

    const unavailableSource = {
      ...imageSource("90"),
      sourceName: "/camera/rear",
    };
    render(
      <PanelVisibilityProvider
        scopeKey="dataset-a"
        sources={[unavailableSource]}
      >
        <TilingProvider>
          <TileIdScope tileId="image-1">
            <PreferencePublisher sourceId="90" />
            <PreferredBindingProbe />
          </TileIdScope>
        </TilingProvider>
      </PanelVisibilityProvider>,
    );
    expect(screen.getByTestId("preferred-binding").textContent).toBe("");
    expect(
      readSidebarPreferences("dataset-a").tiles["image-1"]?.imageSourceKey,
    ).toBe(semanticSourceKey(firstSource));
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

describe("resolveAvailableAudioStream", () => {
  const front = audioSource("1", "/mic_front");
  const rear = audioSource("2", "/mic_rear");

  it("prefers the durable preference over the currently displayed source", () => {
    expect(resolveAvailableAudioStream("1", "2", [front, rear])).toBe("2");
  });

  it("keeps an available current source while the preference is unresolvable", () => {
    // `null` is the preference existing but pointing at a topic this sample
    // lacks; `undefined` is no preference at all. Neither may disturb a
    // source the pane is already showing.
    expect(resolveAvailableAudioStream("2", null, [front, rear])).toBe("2");
    expect(resolveAvailableAudioStream("2", undefined, [front, rear])).toBe(
      "2",
    );
  });

  it("re-resolves onto the preference after the sample reassigns ids", () => {
    // Same two topics as the previous sample under new positional ids: the
    // id the pane bound at mount is gone, and the preference resolved
    // against the new inventory has to win over `sources[0]`.
    const shifted = [
      audioSource("7", "/mic_front"),
      audioSource("9", "/mic_rear"),
    ];
    expect(resolveAvailableAudioStream("2", "9", shifted)).toBe("9");
  });

  it("falls back to the first source when neither preference nor current is present", () => {
    expect(resolveAvailableAudioStream("9", "8", [front, rear])).toBe("1");
    expect(
      resolveAvailableAudioStream(undefined, undefined, [front, rear]),
    ).toBe("1");
  });

  it("resolves to nothing when the sample carries no audio", () => {
    expect(resolveAvailableAudioStream("1", "2", [])).toBeUndefined();
  });
});

const PersistedAudioBindingsProbe: React.FC = () => (
  <span data-testid="persisted-audio-bindings">
    {JSON.stringify(useAtomValue(persistedAudioTileBindingsAtom))}
  </span>
);

// `undefined` (no preference) and `null` (a preference this sample cannot
// resolve) drive different fallback behavior, so the probe keeps them apart
// rather than collapsing both to an empty string.
const PreferredAudioBindingProbe: React.FC = () => {
  const preferred = usePreferredAudioTileStream();
  return (
    <span data-testid="preferred-audio-binding">
      {preferred === undefined ? "undefined" : (preferred ?? "null")}
    </span>
  );
};

const AudioPreferencePublisher: React.FC<{
  readonly selectedSourceId?: string;
  readonly sourceId: string;
}> = ({ selectedSourceId, sourceId }) => {
  const persistBinding = usePersistAudioTileBinding(sourceId);
  // This effect stands in for the user picking a topic in tile settings.
  React.useEffect(() => {
    if (selectedSourceId) persistBinding(selectedSourceId);
  }, [persistBinding, selectedSourceId]);
  return null;
};

describe("usePreferredAudioTileStream", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  function renderProbe(
    sources: readonly SceneSource[],
    scopeKey?: string,
  ): void {
    render(
      <PanelVisibilityProvider scopeKey={scopeKey} sources={sources}>
        <TilingProvider>
          <TileIdScope tileId="audio-1">
            <PreferredAudioBindingProbe />
          </TileIdScope>
        </TilingProvider>
      </PanelVisibilityProvider>,
    );
  }

  function persistKey(sourceName: string): void {
    updateSidebarPreferences("dataset-a", (current) => ({
      ...current,
      tiles: {
        ...current.tiles,
        "audio-1": {
          ...current.tiles["audio-1"],
          audioSourceKey: semanticSourceKey({ sourceName, type: "audio" }),
        },
      },
    }));
  }

  it("has no preference without a dataset scope to read one from", () => {
    persistKey("/mic_rear");
    renderProbe([audioSource("2", "/mic_rear")]);
    expect(screen.getByTestId("preferred-audio-binding").textContent).toBe(
      "undefined",
    );
  });

  it("has no preference when the scope never stored one for this tile", () => {
    renderProbe([audioSource("2", "/mic_rear")], "dataset-a");
    expect(screen.getByTestId("preferred-audio-binding").textContent).toBe(
      "undefined",
    );
  });

  it("resolves the stored semantic key against the sample's runtime ids", () => {
    persistKey("/mic_rear");
    renderProbe(
      [audioSource("7", "/mic_front"), audioSource("9", "/mic_rear")],
      "dataset-a",
    );
    expect(screen.getByTestId("preferred-audio-binding").textContent).toBe("9");
  });

  it("reports an unresolvable preference as null rather than absent", () => {
    persistKey("/mic_gone");
    renderProbe([audioSource("1", "/mic_front")], "dataset-a");
    expect(screen.getByTestId("preferred-audio-binding").textContent).toBe(
      "null",
    );
  });
});

describe("usePersistAudioTileBinding", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const front = audioSource("1", "/mic_front");
  const rear = audioSource("2", "/mic_rear");

  function renderPublisher(
    sources: readonly SceneSource[],
    props: { readonly selectedSourceId?: string; readonly sourceId: string },
    scopeKey?: string,
  ) {
    const tree = (
      nextSources: readonly SceneSource[],
      nextProps: {
        readonly selectedSourceId?: string;
        readonly sourceId: string;
      },
    ) => (
      <PanelVisibilityProvider scopeKey={scopeKey} sources={nextSources}>
        <TilingProvider>
          <TileIdScope tileId="audio-1">
            <AudioPreferencePublisher {...nextProps} />
            <PreferredAudioBindingProbe />
          </TileIdScope>
          <PersistedAudioBindingsProbe />
        </TilingProvider>
      </PanelVisibilityProvider>
    );
    const view = render(tree(sources, props));
    return {
      ...view,
      rerenderWith: (
        nextSources: readonly SceneSource[],
        nextProps: {
          readonly selectedSourceId?: string;
          readonly sourceId: string;
        },
      ) => view.rerender(tree(nextSources, nextProps)),
    };
  }

  const persisted = () =>
    screen.getByTestId("persisted-audio-bindings").textContent;
  const storedKey = () =>
    readSidebarPreferences("dataset-a").tiles["audio-1"]?.audioSourceKey;

  it("seeds a new pane's durable preference from the source it opened on", () => {
    renderPublisher([front, rear], { sourceId: "2" }, "dataset-a");
    expect(persisted()).toBe('{"audio-1":"2"}');
    expect(storedKey()).toBe(semanticSourceKey(rear));
  });

  it("records an intentional selection in both the scope and the atom", () => {
    const view = renderPublisher([front, rear], { sourceId: "1" }, "dataset-a");
    expect(storedKey()).toBe(semanticSourceKey(front));

    view.rerenderWith([front, rear], { selectedSourceId: "2", sourceId: "1" });
    expect(persisted()).toBe('{"audio-1":"2"}');
    expect(storedKey()).toBe(semanticSourceKey(rear));
  });

  it("leaves the stored preference alone while a sample lacks its topic", () => {
    const view = renderPublisher([front, rear], { sourceId: "2" }, "dataset-a");
    expect(storedKey()).toBe(semanticSourceKey(rear));

    // The next sample dropped `/mic_rear`, so the tile is displaying its
    // automatic fallback. That fallback must not be mistaken for a choice.
    view.rerenderWith([front], { sourceId: "1" });
    expect(screen.getByTestId("preferred-audio-binding").textContent).toBe(
      "null",
    );
    expect(storedKey()).toBe(semanticSourceKey(rear));

    // A later sample carries the topic again, under a new id.
    const returned = audioSource("9", "/mic_rear");
    view.rerenderWith([front, returned], { sourceId: "1" });
    expect(screen.getByTestId("preferred-audio-binding").textContent).toBe("9");
    expect(persisted()).toBe('{"audio-1":"9"}');
  });

  it("carries the pane's choice in the atom when there is no scope to persist to", () => {
    const view = renderPublisher([front, rear], { sourceId: "2" });
    expect(persisted()).toBe('{"audio-1":"2"}');
    expect(storedKey()).toBeUndefined();

    // Without a scope the atom is the only memory the pane has, so a
    // fallback display must not overwrite it...
    view.rerenderWith([front], { sourceId: "1" });
    expect(persisted()).toBe('{"audio-1":"2"}');

    // ...while an explicit selection still must.
    view.rerenderWith([front], { selectedSourceId: "1", sourceId: "1" });
    expect(persisted()).toBe('{"audio-1":"1"}');
  });
});
