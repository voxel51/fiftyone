import { fireEvent, render, waitFor } from "@testing-library/react";
import {
  __resetGridCustomRendererFailoverForTests,
  getGridCustomRendererFailover,
  modalSelector,
} from "@fiftyone/state";
import { registerMcapGridOverlay } from "@fiftyone/multimodal/extensions/timeline";
import React from "react";
import { RecoilRoot } from "recoil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCustomRendererItem } from "./GridCustomRendererItem";

// The multimodal guard also mounts the temporal-tag overlay, which reaches
// for an mcap source these tests do not build
vi.mock("@fiftyone/multimodal/temporal-tags/grid-overlay", () => ({
  TemporalTagGridOverlay: () => null,
}));

vi.mock("./GridTagBubbles", () => ({
  default: ({ sample }: { sample?: { filepath?: string } }) => (
    <div data-testid="grid-tag-bubbles">{sample?.filepath}</div>
  ),
}));

const BASE_CTX = {
  sample: { sample: { id: "sample-id", filepath: "/tmp/file.pdf" } },
  media: {
    field: "filepath",
    path: "/tmp/file.pdf",
    url: "/media/file.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    mediaType: "unknown",
    isNative: false,
  },
  surface: "grid",
  dataset: { name: "dataset" },
  schema: {},
} as const;

const BASE_SYMBOL = { description: "sample-id" } as const;

const RGBA_BYTES_PER_PIXEL = 4;
const MIN_GRID_RENDERER_SIZE_BYTES = 1;

const TestBridge = ({ children }: React.PropsWithChildren) => (
  <RecoilRoot>{children}</RecoilRoot>
);
const ModalBridge = ({ children }: React.PropsWithChildren) => (
  <RecoilRoot initializeState={({ set }) => set(modalSelector, { id: "1" })}>
    {children}
  </RecoilRoot>
);

const getOpenModalButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>("button[title='Open sample modal']");

const getSelectControl = (host: HTMLElement) =>
  host.querySelector<HTMLElement>(
    "[title='Select sample'], [title='Selected']",
  );

describe("GridCustomRendererItem", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetGridCustomRendererFailoverForTests();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    __resetGridCustomRendererFailoverForTests();
    consoleErrorSpy.mockRestore();
  });

  it("renders registered mcap overlays inside the multimodal guard", async () => {
    const unregister = registerMcapGridOverlay(() => (
      <div data-testid="registered-overlay" />
    ));
    const host = document.createElement("div");
    document.body.appendChild(host);
    let looker: GridCustomRendererItem | undefined;
    try {
      looker = new GridCustomRendererItem({
        pluginName: "mcap-renderer",
        Renderer: () => <div data-testid="renderer" />,
        RecoilBridge: TestBridge,
        ctx: {
          ...BASE_CTX,
          media: { ...BASE_CTX.media, mediaType: "multimodal" },
        } as any,
        symbol: BASE_SYMBOL,
      });
      looker.attach(host, [200, 120], 12);

      await waitFor(() => {
        expect(
          host.querySelector("[data-testid='registered-overlay']"),
        ).toBeTruthy();
      });
    } finally {
      looker?.destroy();
      unregister();
      host.remove();
    }
  });

  it("renders no edition overlay before anything registers", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let looker: GridCustomRendererItem | undefined;
    try {
      looker = new GridCustomRendererItem({
        pluginName: "mcap-renderer",
        Renderer: () => <div data-testid="renderer" />,
        RecoilBridge: TestBridge,
        ctx: {
          ...BASE_CTX,
          media: { ...BASE_CTX.media, mediaType: "multimodal" },
        } as any,
        symbol: BASE_SYMBOL,
      });
      looker.attach(host, [200, 120], 12);

      await waitFor(() => {
        expect(host.querySelector("[data-testid='renderer']")).toBeTruthy();
      });
      expect(
        host.querySelector("[data-testid='registered-overlay']"),
      ).toBeNull();
    } finally {
      looker?.destroy();
      host.remove();
    }
  });

  it("keeps a still-registered overlay mounted when an earlier one unregisters", async () => {
    const secondMounts = vi.fn();
    const First = () => <div data-testid="overlay-first" />;
    const Second = () => {
      React.useEffect(() => {
        secondMounts();
      }, []);
      return <div data-testid="overlay-second" />;
    };
    const unregisterFirst = registerMcapGridOverlay(First);
    const unregisterSecond = registerMcapGridOverlay(Second);
    const host = document.createElement("div");
    document.body.appendChild(host);
    let looker: GridCustomRendererItem | undefined;
    try {
      looker = new GridCustomRendererItem({
        pluginName: "mcap-renderer",
        Renderer: () => <div data-testid="renderer" />,
        RecoilBridge: TestBridge,
        ctx: {
          ...BASE_CTX,
          media: { ...BASE_CTX.media, mediaType: "multimodal" },
        } as any,
        symbol: BASE_SYMBOL,
      });
      looker.attach(host, [200, 120], 12);

      await waitFor(() => {
        expect(
          host.querySelector("[data-testid='overlay-second']"),
        ).toBeTruthy();
      });
      // Settle any renders unrelated to the registry change below before
      // taking the baseline — this asserts no ADDITIONAL mount happens once
      // the first overlay unregisters, not that mounting never happens at all
      const mountsBeforeUnregister = secondMounts.mock.calls.length;

      unregisterFirst();

      await waitFor(() => {
        expect(host.querySelector("[data-testid='overlay-first']")).toBeNull();
      });
      expect(host.querySelector("[data-testid='overlay-second']")).toBeTruthy();
      // An index-keyed list would shift the second overlay into the first's
      // old slot and remount it; a reference-keyed one does not
      expect(secondMounts).toHaveBeenCalledTimes(mountsBeforeUnregister);
    } finally {
      looker?.destroy();
      unregisterSecond();
      host.remove();
    }
  });

  it("mounts plugin renderer and leaves dataset fail-open disabled on success", async () => {
    const Renderer = ({ ctx }: { ctx: { media: { url: string | null } } }) => (
      <div data-testid="renderer">{ctx.media.url}</div>
    );
    const looker = new GridCustomRendererItem({
      pluginName: "pdf-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const loadSpy = vi.fn();
    looker.addEventListener("load", loadSpy);

    looker.attach(host, [200, 120], 12);

    await waitFor(() => {
      expect(host.textContent).toContain("/media/file.pdf");
    });

    expect(getGridCustomRendererFailover(BASE_CTX.dataset.name)).toBeNull();
    expect(loadSpy).toHaveBeenCalled();
    const openButton = getOpenModalButton(host);
    if (!openButton) {
      throw new Error("Expected the open-modal button to be mounted");
    }
    expect(getSelectControl(host)).toBeNull();

    const renderer = host.querySelector("[data-testid='renderer']");
    if (!(renderer instanceof HTMLElement)) {
      throw new Error("Expected the custom grid renderer to be mounted");
    }

    const wrapper = renderer.parentElement;
    if (!wrapper) {
      throw new Error("Expected the custom grid renderer wrapper");
    }

    const hostClickSpy = vi.fn();
    const hostContextMenuSpy = vi.fn();
    host.addEventListener("click", hostClickSpy);
    host.addEventListener("contextmenu", hostContextMenuSpy);

    fireEvent.click(renderer);
    fireEvent.contextMenu(renderer);

    expect(hostClickSpy).not.toHaveBeenCalled();
    expect(hostContextMenuSpy).not.toHaveBeenCalled();

    openButton.click();
    expect(hostClickSpy).toHaveBeenCalledTimes(1);

    fireEvent.mouseEnter(wrapper);

    await waitFor(() => {
      expect(getOpenModalButton(host)).toBe(openButton);
      expect(getSelectControl(host)).toBeTruthy();
    });

    expect(
      openButton.querySelector("[data-testid='OpenInFullIcon']"),
    ).toBeTruthy();

    const selectSpy = vi.fn();
    looker.addEventListener("selectthumbnail", selectSpy);
    const selectButton = getSelectControl(host);
    if (!selectButton) {
      throw new Error("Expected the sample selection control");
    }
    selectButton.dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey: true, altKey: true }),
    );
    expect(selectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          shiftKey: true,
          altKey: true,
          ctrlKey: false,
          metaKey: false,
          id: "sample-id",
          symbol: BASE_SYMBOL,
        }),
      }),
    );

    fireEvent.mouseLeave(wrapper);

    await waitFor(() => {
      expect(getOpenModalButton(host)).toBe(openButton);
      expect(getSelectControl(host)).toBeTruthy();
    });

    looker.destroy();
    host.remove();
  });

  it("passes unhandled tile activation through when configured", async () => {
    const Renderer = () => <div data-testid="renderer">preview</div>;
    const looker = new GridCustomRendererItem({
      clickBehavior: "passthrough",
      pluginName: "passive-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const hostClickSpy = vi.fn();
    const hostContextMenuSpy = vi.fn();
    host.addEventListener("click", hostClickSpy);
    host.addEventListener("contextmenu", hostContextMenuSpy);

    looker.attach(host, [200, 120], 12);

    const renderer = await waitFor(() => {
      const element = host.querySelector("[data-testid='renderer']");
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });

    fireEvent.click(renderer);
    fireEvent.contextMenu(renderer);

    expect(hostClickSpy).toHaveBeenCalledTimes(1);
    expect(hostContextMenuSpy).toHaveBeenCalledTimes(1);

    looker.destroy();
    host.remove();
  });

  it("marks the dataset fail-open and stops retrying the plugin after a throw", async () => {
    const Renderer = vi.fn(() => {
      throw new Error("render failed");
    });
    const looker = new GridCustomRendererItem({
      pluginName: "broken-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const tileWidthPx = 320;
    const tileHeightPx = 180;
    looker.attach(host, [tileWidthPx, tileHeightPx], 14);

    await waitFor(() => {
      expect(
        getGridCustomRendererFailover(BASE_CTX.dataset.name),
      ).toMatchObject({
        datasetName: "dataset",
        errorMessage: "render failed",
        rendererName: "broken-renderer",
      });
    });

    const callsAfterFailure = Renderer.mock.calls.length;
    looker.updateOptions({ selected: true }, true);
    looker.refreshSample(["predictions"]);

    expect(Renderer.mock.calls.length).toBe(callsAfterFailure);
    expect(looker.getSampleOverlays()).toEqual([]);
    expect(looker.getSizeBytesEstimate()).toBe(
      tileWidthPx * tileHeightPx * RGBA_BYTES_PER_PIXEL +
        MIN_GRID_RENDERER_SIZE_BYTES,
    );

    looker.destroy();
    host.remove();
  });

  it("estimates size from raw sample shapes safely", () => {
    const Renderer = () => <div data-testid="renderer">raw sample</div>;
    const tileWidthPx = 10;
    const tileHeightPx = 20;
    const sourceSizeBytes = 123;
    const rawSampleCtx = {
      ...BASE_CTX,
      sample: {
        id: "sample-id",
        filepath: "/tmp/file.pdf",
        metadata: { size_bytes: sourceSizeBytes },
      },
    };
    const looker = new GridCustomRendererItem({
      pluginName: "pdf-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: rawSampleCtx as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    looker.attach(host, [tileWidthPx, tileHeightPx], 12);

    expect(looker.getSizeBytesEstimate()).toBe(
      tileWidthPx * tileHeightPx * RGBA_BYTES_PER_PIXEL +
        sourceSizeBytes +
        MIN_GRID_RENDERER_SIZE_BYTES,
    );

    looker.destroy();
    host.remove();
  });

  it("uses renderer-reported retained bytes instead of the source hint", async () => {
    const retainedBytes = 321;
    const Renderer = ({
      onRetainedBytesChange,
    }: {
      onRetainedBytesChange?: (bytes: number) => void;
    }) => {
      React.useEffect(() => {
        onRetainedBytesChange?.(retainedBytes);
      }, [onRetainedBytesChange]);
      return <div>preview</div>;
    };
    const looker = new GridCustomRendererItem({
      pluginName: "measured-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const refresh = vi.fn();
    looker.addEventListener("refresh", refresh);

    looker.attach(host, [10, 20], 12);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(looker.getSizeBytesEstimate()).toBe(
      10 * 20 * RGBA_BYTES_PER_PIXEL + retainedBytes + 1,
    );

    looker.destroy();
    host.remove();
  });

  it("marks grid renderers inactive while the modal is open", async () => {
    const Renderer = vi.fn(({ isGridActive }: { isGridActive?: boolean }) => (
      <div>{String(isGridActive)}</div>
    ));
    const looker = new GridCustomRendererItem({
      pluginName: "activity-renderer",
      Renderer,
      RecoilBridge: ModalBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    looker.attach(host, [10, 20], 12);

    await waitFor(() => {
      expect(Renderer.mock.calls.at(-1)?.[0]).toMatchObject({
        isGridActive: false,
      });
    });

    looker.destroy();
    host.remove();
  });

  it("avoids synchronously unmounting the plugin root", async () => {
    const Renderer = () => {
      throw new Error("render failed");
    };
    const looker = new GridCustomRendererItem({
      pluginName: "broken-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    looker.attach(host, [320, 180], 14);

    await waitFor(() => {
      expect(getGridCustomRendererFailover(BASE_CTX.dataset.name)).toBeTruthy();
    });

    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" && arg.includes("synchronously unmount"),
        ),
      ),
    ).toBe(false);

    looker.destroy();
    host.remove();
  });

  it("survives a destroy() from inside a React effect cleanup", async () => {
    // How the grid actually destroys items: the looker cache evicts during a
    // render, so destroy() lands in an effect cleanup while React is mid-commit
    // — unmounting the plugin's own root from there warned and raced the commit
    const rendererUnmounted = vi.fn();
    const TestRenderer = () => {
      React.useEffect(() => () => rendererUnmounted(), [rendererUnmounted]);
      return <div data-testid="rendered" />;
    };
    const looker = new GridCustomRendererItem({
      pluginName: "renderer",
      Renderer: TestRenderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    looker.attach(host, [320, 180], 14);

    await waitFor(() =>
      expect(host.querySelector("[data-testid='rendered']")).toBeTruthy(),
    );

    const Evictor = () => {
      React.useEffect(() => () => looker.destroy(), []);
      return <div data-testid="evictor" />;
    };
    const { unmount } = render(
      <TestBridge>
        <Evictor />
      </TestBridge>,
    );

    unmount();
    // The deferred unmount has to actually happen, not merely be postponed
    await waitFor(() => expect(rendererUnmounted).toHaveBeenCalledTimes(1));

    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" && arg.includes("synchronously unmount"),
        ),
      ),
    ).toBe(false);

    host.remove();
  });
});
