import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridSampleRendererItem } from "./GridSampleRendererItem";

vi.mock("./GridTagBubbles", () => ({
  default: ({ sample }: { sample?: { filepath?: string } }) => (
    <div data-testid="grid-tag-bubbles">{sample?.filepath}</div>
  ),
}));

class MockFallbackRenderer extends EventTarget {
  public loaded = true;
  attach = vi.fn();
  detach = vi.fn();
  destroy = vi.fn();
  updateOptions = vi.fn();
  refreshSample = vi.fn();
  getSampleOverlays = vi.fn(() => []);
  getSizeBytesEstimate = vi.fn(() => 256);
}

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

const TestBridge = ({ children }: React.PropsWithChildren) => <>{children}</>;

const getOpenModalButton = (host: HTMLElement) =>
  host.querySelector("button[title='Open sample modal']");

const getSelectControl = (host: HTMLElement) =>
  host.querySelector("[title='Select sample'], [title='Selected']");

describe("GridSampleRendererItem", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress React error boundary noise in test output
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("mounts plugin renderer and does not invoke fallback on success", async () => {
    const createFallbackRenderer = vi.fn(
      () => new MockFallbackRenderer() as any
    );
    const Component = ({ ctx }: { ctx: { media: { url: string | null } } }) => (
      <div data-testid="renderer">{ctx.media.url}</div>
    );
    const renderer = new GridSampleRendererItem({
      createFallbackRenderer,
      pluginName: "pdf-renderer",
      Renderer: Component,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const loadSpy = vi.fn();
    renderer.addEventListener("load", loadSpy);

    renderer.attach(host, [200, 120], 12);

    await waitFor(() => {
      expect(host.textContent).toContain("/media/file.pdf");
    });
    expect(host.textContent).toContain("/tmp/file.pdf");

    expect(createFallbackRenderer).not.toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
    expect(getOpenModalButton(host)).toBeNull();
    expect(getSelectControl(host)).toBeNull();

    const element = host.querySelector("[data-testid='renderer']");
    expect(element).toBeTruthy();

    const wrapper = element?.parentElement as HTMLElement | null;
    expect(wrapper).toBeTruthy();

    fireEvent.mouseEnter(wrapper as HTMLElement);

    await waitFor(() => {
      expect(getOpenModalButton(host)).toBeTruthy();
      expect(getSelectControl(host)).toBeTruthy();
    });

    // "Open sample modal" button dispatches a click on the host container
    const hostClickSpy = vi.fn();
    host.addEventListener("click", hostClickSpy);
    const openButton = getOpenModalButton(host) as HTMLElement | null;
    expect(openButton).toBeTruthy();
    openButton?.click();
    expect(hostClickSpy).toHaveBeenCalled();

    const selectSpy = vi.fn();
    renderer.addEventListener("selectthumbnail", selectSpy);
    const selectButton = getSelectControl(host) as HTMLElement | null;
    expect(selectButton).toBeTruthy();
    selectButton?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey: true, altKey: true })
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
      })
    );

    fireEvent.mouseLeave(wrapper as HTMLElement);

    await waitFor(() => {
      expect(getOpenModalButton(host)).toBeNull();
      expect(getSelectControl(host)).toBeTruthy();
    });

    renderer.destroy();
    host.remove();
  });

  it("activates fallback renderer when plugin renderer throws", async () => {
    const fallback = new MockFallbackRenderer();
    const createFallbackRenderer = vi.fn(() => fallback as any);
    const Renderer = () => {
      throw new Error("render failed");
    };
    const renderer = new GridSampleRendererItem({
      createFallbackRenderer,
      pluginName: "broken-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    renderer.attach(host, [320, 180], 14);

    // Fallback renderer should be created and attached to the same host element
    await waitFor(() => {
      expect(createFallbackRenderer).toHaveBeenCalled();
    });
    expect(fallback.attach).toHaveBeenCalledWith(
      host,
      expect.anything(),
      expect.anything()
    );

    // Delegation: methods forward to the fallback renderer
    renderer.updateOptions({ foo: "bar" }, true);
    expect(fallback.updateOptions).toHaveBeenCalled();

    renderer.refreshSample(["predictions"]);
    expect(fallback.refreshSample).toHaveBeenCalled();

    expect(renderer.getSampleOverlays()).toEqual([]);
    expect(renderer.getSizeBytesEstimate()).toBe(256);

    renderer.destroy();
    expect(fallback.destroy).toHaveBeenCalled();
    host.remove();
  });

  it("forwards events from fallback renderer to its own listeners", async () => {
    const fallback = new MockFallbackRenderer();
    const createFallbackRenderer = vi.fn(() => fallback as any);
    const Renderer = () => {
      throw new Error("render failed");
    };
    const renderer = new GridSampleRendererItem({
      createFallbackRenderer,
      pluginName: "broken-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      symbol: BASE_SYMBOL,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const selectSpy = vi.fn();
    const refreshSpy = vi.fn();
    const loadSpy = vi.fn();
    renderer.addEventListener("selectthumbnail", selectSpy);
    renderer.addEventListener("refresh", refreshSpy);
    renderer.addEventListener("load", loadSpy);

    renderer.attach(host, [320, 180], 14);

    // Wait for fallback renderer to activate
    await waitFor(() => {
      expect(createFallbackRenderer).toHaveBeenCalled();
    });

    // Simulate events emitted by the fallback renderer
    fallback.dispatchEvent(
      new CustomEvent("selectthumbnail", { detail: { id: "sample-1" } })
    );
    fallback.dispatchEvent(new CustomEvent("refresh"));
    fallback.dispatchEvent(new CustomEvent("load"));

    expect(selectSpy).toHaveBeenCalled();
    expect((selectSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({
      id: "sample-1",
    });
    expect(refreshSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();

    renderer.destroy();
    host.remove();
  });
});
