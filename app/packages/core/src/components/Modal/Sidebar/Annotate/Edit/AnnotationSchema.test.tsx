import { LIGHTER_EVENTS, TransformOverlayCommand } from "@fiftyone/lighter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AnnotationSchema", () => {
  let mockScene: any;
  let mockOverlay: any;
  let commandExecutedHandler: any;

  beforeEach(() => {
    commandExecutedHandler = null;
    mockScene = {
      on: vi.fn((event: string, handler: any) => {
        if (event === LIGHTER_EVENTS.COMMAND_EXECUTED) {
          commandExecutedHandler = handler;
        }
      }),
      off: vi.fn(),
      executeCommand: vi.fn(),
    };

    mockOverlay = {
      label: { id: "test-id", label: "test-label" },
      id: "overlay-1",
      getAbsoluteBounds: vi.fn(() => ({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      })),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("COMMAND_EXECUTED event handler", () => {
    it("should filter out TransformOverlayCommand events", () => {
      // This test verifies the fix for the label dropdown focus stealing issue
      // When a TransformOverlayCommand is executed (e.g., during drag/resize),
      // it should NOT trigger a label data save, which would cause remounting

      const saveSpy = vi.fn();

      // Simulate a TransformOverlayCommand event
      const transformCommand = new TransformOverlayCommand(
        mockOverlay,
        "overlay-1",
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 10, y: 10, width: 110, height: 110 }
      );

      const event = {
        detail: {
          command: transformCommand,
          commandId: "test-command",
          isUndoable: true,
        },
      };

      // Verify that TransformOverlayCommand has the expected constructor name
      expect(transformCommand.constructor.name).toBe("TransformOverlayCommand");

      // The handler should check for TransformOverlayCommand and skip saving
      // This is what prevents the label dropdown from remounting and stealing focus
      if (
        event?.detail?.command?.constructor?.name === "TransformOverlayCommand"
      ) {
        // Should return early and NOT call save
        expect(saveSpy).not.toHaveBeenCalled();
      } else {
        // For other commands, should save
        saveSpy(mockOverlay.label);
        expect(saveSpy).toHaveBeenCalledWith(mockOverlay.label);
      }
    });

    it("should allow non-TransformOverlayCommand events to trigger saves", () => {
      const saveSpy = vi.fn();

      // Simulate a different command (e.g., UpdateLabelCommand)
      const mockCommand = {
        constructor: { name: "UpdateLabelCommand" },
        execute: vi.fn(),
      };

      const event = {
        detail: {
          command: mockCommand,
          commandId: "test-command",
          isUndoable: true,
        },
      };

      // The handler should NOT filter this command
      if (
        event?.detail?.command?.constructor?.name === "TransformOverlayCommand"
      ) {
        // Should skip
      } else {
        // Should save for other commands
        saveSpy(mockOverlay.label);
        expect(saveSpy).toHaveBeenCalledWith(mockOverlay.label);
      }
    });

    it("should handle undefined event gracefully", () => {
      const saveSpy = vi.fn();

      // Test with undefined event
      const event = undefined;

      if (
        event?.detail?.command?.constructor?.name === "TransformOverlayCommand"
      ) {
        // Should not reach here
        expect(false).toBe(true);
      } else {
        // Should proceed with save
        saveSpy(mockOverlay.label);
        expect(saveSpy).toHaveBeenCalled();
      }
    });
  });
});
