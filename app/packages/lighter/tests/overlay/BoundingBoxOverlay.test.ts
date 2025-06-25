/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BoundingBoxOverlay } from "../../src/overlay/BoundingBoxOverlay";
import type { BoundingBoxOptions } from "../../src/overlay/BoundingBoxOverlay";
import type { Renderer2D } from "../../src/renderer/Renderer2D";
import type { EventBus } from "../../src/event/EventBus";
import type { Rect, DrawStyle } from "../../src/types";
import { describe, it, expect, beforeEach } from "vitest";

// Mock implementations for testing
class MockRenderer implements Renderer2D {
  public drawRectCalls: { bounds: Rect; style: DrawStyle }[] = [];
  public drawTextCalls: { text: string; position: any; options?: any }[] = [];
  public drawLineCalls: any[] = [];
  public drawCircleCalls: any[] = [];
  public clearCalls = 0;
  public addOverlayCalls: any[] = [];
  public removeOverlayCalls: string[] = [];
  public startRenderLoopCalls: (() => void)[] = [];
  public stopRenderLoopCalls = 0;

  drawRect(bounds: Rect, style: DrawStyle): void {
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

  addOverlay(overlay: any): void {
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

describe("BoundingBoxOverlay", () => {
  let overlay: BoundingBoxOverlay;
  let options: BoundingBoxOptions;
  let mockRenderer: MockRenderer;
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    options = {
      bounds: { x: 10, y: 20, width: 100, height: 50 },
      style: { strokeStyle: "#ff0000", lineWidth: 2 },
      label: "person",
      confidence: 0.95,
    };

    overlay = new BoundingBoxOverlay(options);
    mockRenderer = new MockRenderer();
    mockEventBus = new MockEventBus();
  });

  describe("constructor", () => {
    it("should set correct properties", () => {
      expect(overlay.name).toBe("bounding-box");
      expect(overlay.tags).toEqual(["detection", "bounding-box"]);
      expect(overlay.status).toBe("pending");
      expect(overlay.id).toMatch(/^bbox_\d+_[a-z0-9]+$/);
    });
  });

  describe("setRenderer", () => {
    it("should set the renderer", () => {
      overlay.setRenderer(mockRenderer);
      // The renderer is stored privately, so we test it through render()
      overlay.render(mockRenderer);
      expect(mockRenderer.drawRectCalls).toHaveLength(1);
    });
  });

  describe("attachEventBus", () => {
    it("should attach the event bus", () => {
      overlay.attachEventBus(mockEventBus);
      // Test that event bus is attached by checking if events are emitted
      overlay.render(mockRenderer);
      expect(mockEventBus.emittedEvents).toHaveLength(1);
    });
  });

  describe("render", () => {
    beforeEach(() => {
      overlay.setRenderer(mockRenderer);
      overlay.attachEventBus(mockEventBus);
    });

    it("should draw the bounding box with correct parameters", () => {
      overlay.render(mockRenderer);

      expect(mockRenderer.drawRectCalls).toHaveLength(1);
      expect(mockRenderer.drawRectCalls[0].bounds).toEqual(options.bounds);
      expect(mockRenderer.drawRectCalls[0].style).toEqual(options.style);
    });

    it("should draw label text when label is provided", () => {
      overlay.render(mockRenderer);

      expect(mockRenderer.drawTextCalls).toHaveLength(1);
      expect(mockRenderer.drawTextCalls[0].text).toBe("person");
      expect(mockRenderer.drawTextCalls[0].position).toEqual({
        x: 10,
        y: 0, // Above the box (20 - 20)
      });
    });

    it("should not draw label text when label is not provided", () => {
      const overlayWithoutLabel = new BoundingBoxOverlay({
        bounds: options.bounds,
        style: options.style,
      });
      overlayWithoutLabel.setRenderer(mockRenderer);
      overlayWithoutLabel.render(mockRenderer);

      expect(mockRenderer.drawTextCalls).toHaveLength(0);
    });

    it("should emit overlay-loaded event", () => {
      overlay.render(mockRenderer);

      expect(mockEventBus.emittedEvents).toHaveLength(1);
      expect(mockEventBus.emittedEvents[0]).toEqual({
        type: "overlay-loaded",
        detail: { id: overlay.id },
      });
    });

    it("should update status to painted", () => {
      overlay.render(mockRenderer);
      expect(overlay.status).toBe("painted");
    });
  });

  describe("getters", () => {
    it("should return correct bounds", () => {
      expect(overlay.getBounds()).toEqual(options.bounds);
    });

    it("should return correct style", () => {
      expect(overlay.getStyle()).toEqual(options.style);
    });

    it("should return correct label", () => {
      expect(overlay.getLabel()).toBe("person");
    });

    it("should return correct confidence", () => {
      expect(overlay.getConfidence()).toBe(0.95);
    });
  });
});
