/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Scene2D } from "../../src/core/Scene2D";
import type { Scene2DConfig } from "../../src/core/SceneConfig";
import type { Renderer2D } from "../../src/renderer/Renderer2D";
import type { BaseOverlay } from "../../src/overlay/BaseOverlay";
import type { ResourceLoader } from "../../src/resource/ResourceLoader";
import type { EventBus } from "../../src/event/EventBus";

import { describe, it, expect, beforeEach } from "vitest";

// Mock implementations for testing
class MockRenderer implements Renderer2D {
  public addOverlayCalls: BaseOverlay[] = [];
  public removeOverlayCalls: string[] = [];
  public startRenderLoopCalls: (() => void)[] = [];
  public stopRenderLoopCalls = 0;
  public drawRectCalls: any[] = [];
  public drawTextCalls: any[] = [];
  public drawLineCalls: any[] = [];
  public drawCircleCalls: any[] = [];
  public clearCalls = 0;

  addOverlay(overlay: BaseOverlay): void {
    this.addOverlayCalls.push(overlay);
  }

  removeOverlay(id: string): void {
    this.removeOverlayCalls.push(id);
  }

  startRenderLoop(onFrame: () => void): void {
    this.startRenderLoopCalls.push(onFrame);
  }

  stopRenderLoop(): void {
    this.stopRenderLoopCalls++;
  }

  drawRect(bounds: any, style: any): void {
    this.drawRectCalls.push({ bounds, style });
  }

  drawText(text: string, position: any, options?: any): void {
    this.drawTextCalls.push({ text, position, options });
  }

  drawLine(start: any, end: any, style: any): void {
    this.drawLineCalls.push({ start, end, style });
  }

  drawCircle(center: any, radius: number, style: any): void {
    this.drawCircleCalls.push({ center, radius, style });
  }

  clear(): void {
    this.clearCalls++;
  }
}

class MockOverlay implements BaseOverlay {
  public id = "test-overlay";
  public name = "test";
  public tags: string[] = [];
  public status: "pending" | "decoded" | "painting" | "painted" = "pending";
  public rendererSet = false;
  public eventBusAttached = false;

  setRenderer(renderer: Renderer2D): void {
    this.rendererSet = true;
  }

  render(renderer: Renderer2D): void {
    // Mock render implementation
  }

  attachEventBus(bus: EventBus): void {
    this.eventBusAttached = true;
  }
}

class MockResourceLoader implements ResourceLoader {
  async load<T>(url: string, retries?: number): Promise<T> {
    return {} as T;
  }
}

class MockEventBus extends EventTarget implements EventBus {
  public emittedEvents: any[] = [];

  emit(event: any): void {
    this.emittedEvents.push(event);
  }

  on(type: any, listener: (e: CustomEvent) => void): void {
    this.addEventListener(type, listener as EventListener);
  }

  off(type: any, listener: (e: CustomEvent) => void): void {
    this.removeEventListener(type, listener as EventListener);
  }
}

describe("Scene2D", () => {
  let scene: Scene2D;
  let config: Scene2DConfig;
  let mockRenderer: MockRenderer;
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    const canvas = document.createElement("canvas");
    mockRenderer = new MockRenderer();
    mockEventBus = new MockEventBus();
    const mockResourceLoader = new MockResourceLoader();

    config = {
      canvas,
      renderer: mockRenderer,
      resourceLoader: mockResourceLoader,
      eventBus: mockEventBus,
    };

    scene = new Scene2D(config);
  });

  describe("constructor", () => {
    it("should start the render loop", () => {
      expect(mockRenderer.startRenderLoopCalls).toHaveLength(1);
    });
  });

  describe("addOverlay", () => {
    it("should inject renderer and attach event bus to overlay", () => {
      const overlay = new MockOverlay();
      scene.addOverlay(overlay);

      expect(overlay.rendererSet).toBe(true);
      expect(overlay.eventBusAttached).toBe(true);
    });

    it("should add overlay to renderer", () => {
      const overlay = new MockOverlay();
      scene.addOverlay(overlay);

      expect(mockRenderer.addOverlayCalls).toHaveLength(1);
      expect(mockRenderer.addOverlayCalls[0]).toBe(overlay);
    });

    it("should emit overlay-loaded event", () => {
      const overlay = new MockOverlay();
      scene.addOverlay(overlay);

      expect(mockEventBus.emittedEvents).toHaveLength(1);
      expect(mockEventBus.emittedEvents[0]).toEqual({
        type: "overlay-loaded",
        detail: { id: overlay.id },
      });
    });
  });

  describe("removeOverlay", () => {
    it("should remove overlay from renderer", () => {
      const overlay = new MockOverlay();
      scene.addOverlay(overlay);
      scene.removeOverlay(overlay.id);

      expect(mockRenderer.removeOverlayCalls).toHaveLength(1);
      expect(mockRenderer.removeOverlayCalls[0]).toBe(overlay.id);
    });
  });

  describe("getOverlay", () => {
    it("should return overlay by id", () => {
      const overlay = new MockOverlay();
      scene.addOverlay(overlay);

      const retrieved = scene.getOverlay(overlay.id);
      expect(retrieved).toBe(overlay);
    });

    it("should return undefined for non-existent overlay", () => {
      const retrieved = scene.getOverlay("non-existent");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getOverlaysByTag", () => {
    it("should return overlays with matching tag", () => {
      const overlay1 = new MockOverlay();
      overlay1.tags = ["detection"];
      const overlay2 = new MockOverlay();
      overlay2.tags = ["classification"];
      const overlay3 = new MockOverlay();
      overlay3.tags = ["detection"];

      scene.addOverlay(overlay1);
      scene.addOverlay(overlay2);
      scene.addOverlay(overlay3);

      const detectionOverlays = scene.getOverlaysByTag("detection");
      expect(detectionOverlays).toHaveLength(2);
      expect(detectionOverlays).toContain(overlay1);
      expect(detectionOverlays).toContain(overlay3);
    });
  });

  describe("destroy", () => {
    it("should stop render loop and clear resources", () => {
      scene.destroy();

      expect(mockRenderer.stopRenderLoopCalls).toBe(1);
    });
  });
});
