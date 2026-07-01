import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemporalTagProvider } from "./TemporalTagContext";
import TemporalTagButton from "./TemporalTagButton";
import type { TemporalTagContextValue } from "./TemporalTagContext";
import type { TemporalTagModeState } from "./use-temporal-tag-mode";

const idleState: TemporalTagModeState = {
  phase: "idle",
  selection: null,
  previewStart: null,
  previewEnd: null,
  anchor: null,
  pendingLabel: "",
};

const readyState: TemporalTagModeState = { ...idleState, phase: "ready" };

function makeActions(
  overrides: Partial<TemporalTagContextValue["actions"]> = {},
) {
  return {
    enterTagMode: vi.fn(),
    exitTagMode: vi.fn(),
    startDrag: vi.fn(),
    updateDrag: vi.fn(),
    finishDrag: vi.fn(),
    setAnchorHandle: vi.fn(),
    setLabel: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
}

function renderButton(ctx: TemporalTagContextValue | null) {
  return render(
    ctx ? (
      <TemporalTagProvider value={ctx}>
        <TemporalTagButton />
      </TemporalTagProvider>
    ) : (
      <TemporalTagButton />
    ),
  );
}

describe("TemporalTagButton", () => {
  afterEach(() => cleanup());

  it("renders nothing when outside a TemporalTagProvider", () => {
    const { container } = renderButton(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when onTagCreate is absent (context present but no callback)", () => {
    const ctx: TemporalTagContextValue = {
      state: idleState,
      actions: makeActions(),
      // onTagCreate intentionally absent
    };
    const { container } = renderButton(ctx);
    expect(container.firstChild).toBeNull();
  });

  it("renders the button when context has onTagCreate", () => {
    const ctx: TemporalTagContextValue = {
      state: idleState,
      actions: makeActions(),
      onTagCreate: vi.fn(),
    };
    renderButton(ctx);
    expect(screen.getByTestId("temporal-tag-mode-button")).toBeTruthy();
  });

  it("shows 'Enter tag mode (T)' aria-label when idle", () => {
    const ctx: TemporalTagContextValue = {
      state: idleState,
      actions: makeActions(),
      onTagCreate: vi.fn(),
    };
    renderButton(ctx);
    expect(
      screen.getByRole("button", { name: "Enter tag mode (T)" }),
    ).toBeTruthy();
  });

  it("shows 'Exit tag mode' aria-label and aria-pressed=true when active", () => {
    const ctx: TemporalTagContextValue = {
      state: readyState,
      actions: makeActions(),
      onTagCreate: vi.fn(),
    };
    renderButton(ctx);
    const btn = screen.getByRole("button", { name: "Exit tag mode" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls enterTagMode when clicked while idle", () => {
    const actions = makeActions();
    const ctx: TemporalTagContextValue = {
      state: idleState,
      actions,
      onTagCreate: vi.fn(),
    };
    renderButton(ctx);
    fireEvent.click(screen.getByTestId("temporal-tag-mode-button"));
    expect(actions.enterTagMode).toHaveBeenCalledTimes(1);
  });

  it("calls exitTagMode when clicked while active", () => {
    const actions = makeActions();
    const ctx: TemporalTagContextValue = {
      state: readyState,
      actions,
      onTagCreate: vi.fn(),
    };
    renderButton(ctx);
    fireEvent.click(screen.getByTestId("temporal-tag-mode-button"));
    expect(actions.exitTagMode).toHaveBeenCalledTimes(1);
  });

  describe("T hotkey", () => {
    it("does NOT register T hotkey when onTagCreate is absent", () => {
      const actions = makeActions();
      const ctx: TemporalTagContextValue = {
        state: idleState,
        actions,
        // no onTagCreate
      };
      renderButton(ctx);
      fireEvent.keyDown(window, { key: "t" });
      expect(actions.enterTagMode).not.toHaveBeenCalled();
    });

    it("calls enterTagMode on T keydown when idle", () => {
      const actions = makeActions();
      const ctx: TemporalTagContextValue = {
        state: idleState,
        actions,
        onTagCreate: vi.fn(),
      };
      renderButton(ctx);
      fireEvent.keyDown(window, { key: "t" });
      expect(actions.enterTagMode).toHaveBeenCalledTimes(1);
    });

    it("calls exitTagMode on T keydown when active", () => {
      const actions = makeActions();
      const ctx: TemporalTagContextValue = {
        state: readyState,
        actions,
        onTagCreate: vi.fn(),
      };
      renderButton(ctx);
      fireEvent.keyDown(window, { key: "T" });
      expect(actions.exitTagMode).toHaveBeenCalledTimes(1);
    });

    it("ignores T keydown when focus is inside an input", () => {
      const actions = makeActions();
      const ctx: TemporalTagContextValue = {
        state: idleState,
        actions,
        onTagCreate: vi.fn(),
      };
      render(
        <TemporalTagProvider value={ctx}>
          <input data-testid="text-input" />
          <TemporalTagButton />
        </TemporalTagProvider>,
      );
      const input = screen.getByTestId("text-input");
      fireEvent.keyDown(input, { key: "t" });
      expect(actions.enterTagMode).not.toHaveBeenCalled();
    });

    it("calls exitTagMode on Escape when active", () => {
      const actions = makeActions();
      const ctx: TemporalTagContextValue = {
        state: readyState,
        actions,
        onTagCreate: vi.fn(),
      };
      renderButton(ctx);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(actions.exitTagMode).toHaveBeenCalledTimes(1);
    });

    it("does not call exitTagMode on Escape when already idle", () => {
      const actions = makeActions();
      const ctx: TemporalTagContextValue = {
        state: idleState,
        actions,
        onTagCreate: vi.fn(),
      };
      renderButton(ctx);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(actions.exitTagMode).not.toHaveBeenCalled();
    });
  });
});
