import { waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridRenderClaimsLooker } from "./GridRenderClaimsLooker";

class MockFallbackLooker extends EventTarget {
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
  sample: { id: "sample-id" },
  selectedMediaField: "filepath",
  selectedMediaPath: "/tmp/file.pdf",
  selectedMediaUrl: "/media/file.pdf",
  extension: "pdf",
  mimeType: "application/pdf",
  mediaType: "unknown",
  dataset: { name: "dataset" },
  schema: {},
} as const;

const TestBridge = ({ children }: React.PropsWithChildren) => <>{children}</>;

describe("GridRenderClaimsLooker", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress React error boundary noise in test output
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("mounts plugin renderer and does not invoke fallback on success", async () => {
    const createFallbackLooker = vi.fn(() => new MockFallbackLooker() as any);
    const Renderer = ({ url }: { ctx: unknown; url: string }) => (
      <div data-testid="renderer">{url}</div>
    );
    const looker = new GridRenderClaimsLooker({
      createFallbackLooker,
      pluginName: "pdf-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      url: "/media/file.pdf",
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const loadSpy = vi.fn();
    looker.addEventListener("load", loadSpy);

    looker.attach(host, [200, 120], 12);

    await waitFor(() => {
      expect(host.textContent).toContain("/media/file.pdf");
    });

    expect(createFallbackLooker).not.toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();

    // "Open sample modal" button dispatches a click on the host container
    const hostClickSpy = vi.fn();
    host.addEventListener("click", hostClickSpy);
    const openButton = host.querySelector(
      "button[aria-label='Open sample modal']"
    ) as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();
    openButton?.click();
    expect(hostClickSpy).toHaveBeenCalled();

    looker.destroy();
    host.remove();
  });

  it("activates fallback looker when plugin renderer throws", async () => {
    const fallback = new MockFallbackLooker();
    const createFallbackLooker = vi.fn(() => fallback as any);
    const Renderer = () => {
      throw new Error("render failed");
    };
    const looker = new GridRenderClaimsLooker({
      createFallbackLooker,
      pluginName: "broken-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      url: "/media/file.pdf",
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    looker.attach(host, [320, 180], 14);

    // Fallback should be created and attached to the same host element
    await waitFor(() => {
      expect(createFallbackLooker).toHaveBeenCalled();
    });
    expect(fallback.attach).toHaveBeenCalledWith(
      host,
      expect.anything(),
      expect.anything()
    );

    // Delegation: methods forward to the fallback looker
    looker.updateOptions({ foo: "bar" }, true);
    expect(fallback.updateOptions).toHaveBeenCalled();

    looker.refreshSample(["predictions"]);
    expect(fallback.refreshSample).toHaveBeenCalled();

    expect(looker.getSampleOverlays()).toEqual([]);
    expect(looker.getSizeBytesEstimate()).toBe(256);

    looker.destroy();
    expect(fallback.destroy).toHaveBeenCalled();
    host.remove();
  });

  it("forwards events from fallback looker to its own listeners", async () => {
    const fallback = new MockFallbackLooker();
    const createFallbackLooker = vi.fn(() => fallback as any);
    const Renderer = () => {
      throw new Error("render failed");
    };
    const looker = new GridRenderClaimsLooker({
      createFallbackLooker,
      pluginName: "broken-renderer",
      Renderer,
      RecoilBridge: TestBridge,
      ctx: BASE_CTX as any,
      url: "/media/file.pdf",
    });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const selectSpy = vi.fn();
    const refreshSpy = vi.fn();
    const loadSpy = vi.fn();
    looker.addEventListener("selectthumbnail", selectSpy);
    looker.addEventListener("refresh", refreshSpy);
    looker.addEventListener("load", loadSpy);

    looker.attach(host, [320, 180], 14);

    // Wait for fallback to activate
    await waitFor(() => {
      expect(createFallbackLooker).toHaveBeenCalled();
    });

    // Simulate events emitted by the fallback looker
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

    looker.destroy();
    host.remove();
  });
});
