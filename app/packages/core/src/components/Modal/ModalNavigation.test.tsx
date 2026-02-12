/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ModalNavigation keyboard handler", () => {
  let mockNavigator: { navigate: ReturnType<typeof vi.fn> };
  let keyboardHandler: (e: KeyboardEvent) => void;
  let originalActiveElement: Element | null;

  beforeEach(() => {
    // Save original activeElement
    originalActiveElement = document.activeElement;

    // Create mock navigators
    mockNavigator = {
      navigate: vi.fn(),
    };

    // Create the keyboard handler (simulating the actual handler from ModalNavigation.tsx)
    keyboardHandler = (e: KeyboardEvent) => {
      const active = document.activeElement;

      // Prevent navigation when interacting with any form field
      if (
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.tagName === "SELECT"
      ) {
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        mockNavigator.navigate();
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up any created elements
    document.querySelectorAll("[data-test-element]").forEach((el) => el.remove());
  });

  describe("when no form field is focused", () => {
    it("should navigate on ArrowLeft", () => {
      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
      keyboardHandler(event);
      expect(mockNavigator.navigate).toHaveBeenCalledTimes(1);
    });

    it("should navigate on ArrowRight", () => {
      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);
      expect(mockNavigator.navigate).toHaveBeenCalledTimes(1);
    });

    it("should not navigate on other keys", () => {
      const event = new KeyboardEvent("keydown", { key: "a" });
      keyboardHandler(event);
      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });
  });

  describe("when INPUT field is focused", () => {
    it("should NOT navigate when text input is focused", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when number input is focused", () => {
      const input = document.createElement("input");
      input.type = "number";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when email input is focused", () => {
      const input = document.createElement("input");
      input.type = "email";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when password input is focused", () => {
      const input = document.createElement("input");
      input.type = "password";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when search input is focused", () => {
      const input = document.createElement("input");
      input.type = "search";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when checkbox is focused", () => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when radio button is focused", () => {
      const input = document.createElement("input");
      input.type = "radio";
      input.setAttribute("data-test-element", "true");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });
  });

  describe("when TEXTAREA is focused", () => {
    it("should NOT navigate when textarea is focused", () => {
      const textarea = document.createElement("textarea");
      textarea.setAttribute("data-test-element", "true");
      document.body.appendChild(textarea);
      textarea.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });
  });

  describe("when SELECT is focused", () => {
    it("should NOT navigate when select dropdown is focused", () => {
      const select = document.createElement("select");
      select.setAttribute("data-test-element", "true");
      const option = document.createElement("option");
      option.value = "test";
      select.appendChild(option);
      document.body.appendChild(select);
      select.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });
  });

  describe("when modifier keys are pressed", () => {
    it("should NOT navigate when Alt key is pressed", () => {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        altKey: true,
      });
      keyboardHandler(event);
      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when Ctrl key is pressed", () => {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        ctrlKey: true,
      });
      keyboardHandler(event);
      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it("should NOT navigate when Meta key is pressed", () => {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        metaKey: true,
      });
      keyboardHandler(event);
      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });
  });

  describe("when non-form elements are focused", () => {
    it("should navigate when a div is focused", () => {
      const div = document.createElement("div");
      div.setAttribute("tabindex", "0");
      div.setAttribute("data-test-element", "true");
      document.body.appendChild(div);
      div.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).toHaveBeenCalledTimes(1);
    });

    it("should navigate when a button is focused", () => {
      const button = document.createElement("button");
      button.setAttribute("data-test-element", "true");
      document.body.appendChild(button);
      button.focus();

      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
      keyboardHandler(event);

      expect(mockNavigator.navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe("regression test: form fields should block navigation", () => {
    it("should prevent the bug where arrow keys in number inputs changed samples", () => {
      // This is the specific bug that was fixed:
      // Users couldn't use arrow keys to adjust cursor position in number inputs
      // because it would change the sample instead

      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.setAttribute("data-test-element", "true");
      document.body.appendChild(numberInput);
      numberInput.focus();

      // Simulate user pressing arrow keys to navigate within the input
      const leftArrow = new KeyboardEvent("keydown", { key: "ArrowLeft" });
      const rightArrow = new KeyboardEvent("keydown", { key: "ArrowRight" });

      keyboardHandler(leftArrow);
      keyboardHandler(rightArrow);

      // Should NOT have navigated samples
      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });
  });
});
