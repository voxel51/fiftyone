import { fireEvent, waitFor } from "@testing-library/react";
import {
  __resetGridCustomRendererFailoverForTests,
  getGridCustomRendererFailover,
} from "@fiftyone/state";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCustomRendererItem } from "./GridCustomRendererItem";

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

const TestBridge = ({ children }: React.PropsWithChildren) => <>{children}</>;

const getOpenModalButton = (host: HTMLElement) =>
  host.querySelector("button[title='Open sample modal']");

const getSelectControl = (host: HTMLElement) =>
  host.querySelector("[title='Select sample'], [title='Selected']");

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
    expect(getOpenModalButton(host)).toBeNull();
    expect(getSelectControl(host)).toBeNull();

    const renderer = host.querySelector("[data-testid='renderer']");
    expect(renderer).toBeTruthy();

    const wrapper = renderer?.parentElement as HTMLElement | null;
    expect(wrapper).toBeTruthy();

    fireEvent.mouseEnter(wrapper as HTMLElement);

    await waitFor(() => {
      expect(getOpenModalButton(host)).toBeTruthy();
      expect(getSelectControl(host)).toBeTruthy();
    });

    const hostClickSpy = vi.fn();
    host.addEventListener("click", hostClickSpy);
    const openButton = getOpenModalButton(host) as HTMLElement | null;
    expect(openButton).toBeTruthy();
    openButton?.click();
    expect(hostClickSpy).toHaveBeenCalled();

    const selectSpy = vi.fn();
    looker.addEventListener("selectthumbnail", selectSpy);
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

    looker.attach(host, [320, 180], 14);

    await waitFor(() => {
      expect(
        getGridCustomRendererFailover(BASE_CTX.dataset.name)
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
    expect(looker.getSizeBytesEstimate()).toBe(320 * 180 * 4 + 1);

    looker.destroy();
    host.remove();
  });

  it("estimates size from raw sample shapes safely", () => {
    const Renderer = () => <div data-testid="renderer">raw sample</div>;
    const rawSampleCtx = {
      ...BASE_CTX,
      sample: {
        id: "sample-id",
        filepath: "/tmp/file.pdf",
        metadata: { size_bytes: 123 },
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

    looker.attach(host, [10, 20], 12);

    expect(looker.getSizeBytesEstimate()).toBe(10 * 20 * 4 + 123 + 1);

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
            typeof arg === "string" && arg.includes("synchronously unmount")
        )
      )
    ).toBe(false);

    looker.destroy();
    host.remove();
  });
});
