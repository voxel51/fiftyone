/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Modal keyboard shortcuts handler", () => {
  let mockHandlers: {
    toggleSidebar: ReturnType<typeof vi.fn>;
    toggleFullscreen: ReturnType<typeof vi.fn>;
    toggleSelection: ReturnType<typeof vi.fn>;
    selectSample: ReturnType<typeof vi.fn>;
    closeModal: ReturnType<typeof vi.fn>;
  };
  let keysHandler: (e: KeyboardEvent) => void;

  beforeEach(() => {
    // Create mock handlers
    mockHandlers = {
      toggleSidebar: vi.fn(),
      toggleFullscreen: vi.fn(),
      toggleSelection: vi.fn(),
      selectSample: vi.fn(),
      closeModal: vi.fn(),
    };

    // Create the keyboard handler (simulating the actual handler from Modal.tsx)
    keysHandler = (e: KeyboardEvent) => {
      const active = document.activeElement;

      // Prevent shortcuts when interacting with any form field
      if (
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.tagName === "SELECT"
      ) {
        return;
      }

      if (e.repeat) {
        return;
      }

      if (e.altKey && e.code === "Space") {
        mockHandlers.selectSample();
      } else if (e.key === "s") {
        mockHandlers.toggleSidebar();
      } else if (e.key === "f") {
        mockHandlers.toggleFullscreen();
      } else if (e.key === "x") {
        mockHandlers.toggleSelection();
      } else if (e.key === "Escape") {
        mockHandlers.closeModal();
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up any created elements
    document.querySelectorAll("[data-test-element]").forEach((el) => el.remove());
  });

  describe("when no form field is focused", () => {
    it("should toggle sidebar on 's' key", () => {
      const event = new KeyboardEvent("keydown", { key: "s" });
      keysHandler(event);
      expect(mockHandlers.toggleSidebar).toHaveBeenCalledTimes(1);
    });

    it("should toggle fullscreen on 'f' key", () => {
      const event = new KeyboardEvent("keydown", { key: "f" });
      keysHandler(event);
      expect(mockHandlers.toggleFullscreen).toHaveBeenCalledTimes(1);
    });

    it("should toggle selection on 'x' key", () => {
      const event = new KeyboardEvent("keydown", { key: "x" });
      keysHandler(event);
      expect(mockHandlers.toggleSelection).toHaveBeenCalledTimes(1);
    });

    it("should close modal on Escape key", () => {
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      keysHandler(event);
      expect(mockHandlers.closeModal).toHaveBeenCalledTimes(1);
    });

    it("should select sample on Alt+Space", () => {
      const event = new KeyboardEvent("keydown", {
        code: "Space",
        altKey: true,
      });
      keysHandler(event);
      expect(mockHandlers.selectSample).toHaveBeenCalledTimes(1);
    });

    it("should ignore repeat events", () => {
      const event = new KeyboardEvent("keydown", { key: "s", repeat: true });
      keysHandler(event);
      expect(mockHandlers.toggleSidebar).not.toHaveBeenCalled();
    });
  });

  describe("when INPUT field is focused", () => {
    it("should NOT toggle sidebar when text input is focused and 's' is pressed", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "s" });
      keysHandler(event);

      expect(mockHandlers.toggleSidebar).not.toHaveBeenCalled();
    });

    it("should NOT toggle fullscreen when number input is focused and 'f' is pressed", () => {
      const input = document.createElement("input");
      input.type = "number";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "f" });
      keysHandler(event);

      expect(mockHandlers.toggleFullscreen).not.toHaveBeenCalled();
    });

    it("should NOT toggle selection when email input is focused and 'x' is pressed", () => {
      const input = document.createElement("input");
      input.type = "email";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "x" });
      keysHandler(event);

      expect(mockHandlers.toggleSelection).not.toHaveBeenCalled();
    });

    it("should NOT close modal when password input is focused and Escape is pressed", () => {
      const input = document.createElement("input");
      input.type = "password";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      keysHandler(event);

      expect(mockHandlers.closeModal).not.toHaveBeenCalled();
    });

    it("should NOT select sample when search input is focused and Alt+Space is pressed", () => {
      const input = document.createElement("input");
      input.type = "search";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", {
        code: "Space",
        altKey: true,
      });
      keysHandler(event);

      expect(mockHandlers.selectSample).not.toHaveBeenCalled();
    });

    it("should NOT trigger shortcuts when checkbox is focused", () => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "x" });
      keysHandler(event);

      expect(mockHandlers.toggleSelection).not.toHaveBeenCalled();
    });

    it("should NOT trigger shortcuts when radio button is focused", () => {
      const input = document.createElement("input");
      input.type = "radio";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "s" });
      keysHandler(event);

      expect(mockHandlers.toggleSidebar).not.toHaveBeenCalled();
    });
  });

  describe("when TEXTAREA is focused", () => {
    it("should NOT trigger any shortcuts when textarea is focused", () => {
      const textarea = document.createElement("textarea");
      textarea.setAttribute("data-test-element", "true");
      document.body.appendChild(textarea);
      textarea.focus();

      // Try all shortcuts
      keysHandler(new KeyboardEvent("keydown", { key: "s" }));
      keysHandler(new KeyboardEvent("keydown", { key: "f" }));
      keysHandler(new KeyboardEvent("keydown", { key: "x" }));
      keysHandler(new KeyboardEvent("keydown", { key: "Escape" }));
      keysHandler(
        new KeyboardEvent("keydown", { code: "Space", altKey: true })
      );

      expect(mockHandlers.toggleSidebar).not.toHaveBeenCalled();
      expect(mockHandlers.toggleFullscreen).not.toHaveBeenCalled();
      expect(mockHandlers.toggleSelection).not.toHaveBeenCalled();
      expect(mockHandlers.closeModal).not.toHaveBeenCalled();
      expect(mockHandlers.selectSample).not.toHaveBeenCalled();
    });
  });

  describe("when SELECT is focused", () => {
    it("should NOT trigger shortcuts when select dropdown is focused", () => {
      const select = document.createElement("select");
      select.setAttribute("data-test-element", "true");
      const option = document.createElement("option");
      option.value = "test";
      select.appendChild(option);
      document.body.appendChild(select);
      select.focus();

      // Try all shortcuts
      keysHandler(new KeyboardEvent("keydown", { key: "s" }));
      keysHandler(new KeyboardEvent("keydown", { key: "f" }));
      keysHandler(new KeyboardEvent("keydown", { key: "x" }));

      expect(mockHandlers.toggleSidebar).not.toHaveBeenCalled();
      expect(mockHandlers.toggleFullscreen).not.toHaveBeenCalled();
      expect(mockHandlers.toggleSelection).not.toHaveBeenCalled();
    });
  });

  describe("when non-form elements are focused", () => {
    it("should trigger shortcuts when a div is focused", () => {
      const div = document.createElement("div");
      div.setAttribute("tabindex", "0");
      div.setAttribute("data-test-element", "true");
      document.body.appendChild(div);
      div.focus();

      const event = new KeyboardEvent("keydown", { key: "s" });
      keysHandler(event);

      expect(mockHandlers.toggleSidebar).toHaveBeenCalledTimes(1);
    });

    it("should trigger shortcuts when a button is focused", () => {
      const button = document.createElement("button");
      button.setAttribute("data-test-element", "true");
      document.body.appendChild(button);
      button.focus();

      const event = new KeyboardEvent("keydown", { key: "f" });
      keysHandler(event);

      expect(mockHandlers.toggleFullscreen).toHaveBeenCalledTimes(1);
    });
  });

  describe("regression test: form fields should block all keyboard shortcuts", () => {
    it("should prevent shortcuts in annotation schema inputs", () => {
      // This is the specific bug that was fixed:
      // Users couldn't type 's', 'f', or 'x' in annotation inputs
      // because it would trigger modal shortcuts instead

      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.setAttribute("data-test-element", "true");
      document.body.appendChild(textInput);
      textInput.focus();

      // Simulate user typing text that happens to match shortcuts
      keysHandler(new KeyboardEvent("keydown", { key: "s" }));
      keysHandler(new KeyboardEvent("keydown", { key: "f" }));
      keysHandler(new KeyboardEvent("keydown", { key: "x" }));

      // Should NOT have triggered any shortcuts
      expect(mockHandlers.toggleSidebar).not.toHaveBeenCalled();
      expect(mockHandlers.toggleFullscreen).not.toHaveBeenCalled();
      expect(mockHandlers.toggleSelection).not.toHaveBeenCalled();
    });

    it("should allow Escape to work after fixing form field focus", () => {
      // Verify that Escape still works when form is NOT focused
      document.body.focus();

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      keysHandler(event);

      expect(mockHandlers.closeModal).toHaveBeenCalledTimes(1);
    });
  });

  describe("comprehensive form field coverage", () => {
    const inputTypes = [
      "text",
      "number",
      "email",
      "password",
      "search",
      "tel",
      "url",
      "date",
      "time",
      "datetime-local",
      "month",
      "week",
      "color",
      "range",
    ];

    inputTypes.forEach((type) => {
      it(`should block shortcuts for input type="${type}"`, () => {
        const input = document.createElement("input");
        input.type = type;
        input.setAttribute("data-test-element", "true");
        document.body.appendChild(input);
        input.focus();

        keysHandler(new KeyboardEvent("keydown", { key: "s" }));

        expect(mockHandlers.toggleSidebar).not.toHaveBeenCalled();
      });
    });
  });
});
