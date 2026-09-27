/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * ArrowUp/ArrowDown step the stack under the pointer. A focused stack
 * handles its own keys first and prevents the default, so focus wins.
 */

import { createContext, useEffect, useMemo } from "react";

export interface HoverTarget {
  step: (delta: number) => void;
}

const ARROWS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/** Whether `element` takes typed keys (an input, select, or editable text). */
export const isEditable = (element: Element | null) => {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const editable = element.closest("[contenteditable]");
  return !!editable && editable.getAttribute("contenteditable") !== "false";
};

export const createHoverKeys = () => {
  let hovered: HoverTarget | null = null;

  return {
    enter: (target: HoverTarget) => {
      hovered = target;
    },
    leave: (target: HoverTarget) => {
      if (hovered === target) hovered = null;
    },
    /** Steps the hovered stack; returns whether the key was taken. */
    keydown: (
      event: Pick<
        KeyboardEvent,
        | "altKey"
        | "ctrlKey"
        | "defaultPrevented"
        | "key"
        | "metaKey"
        | "preventDefault"
        | "shiftKey"
      >,
      active: Element | null,
    ) => {
      const delta = ARROWS[event.key];
      if (
        !delta ||
        !hovered ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditable(active)
      ) {
        return false;
      }
      event.preventDefault();
      hovered.step(delta);
      return true;
    },
  };
};

export type HoverKeys = ReturnType<typeof createHoverKeys>;

export const HoverKeysContext = createContext<HoverKeys | null>(null);

/** One window listener for a matrix's stacks. */
export const useHoverKeys = () => {
  const keys = useMemo(() => createHoverKeys(), []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) =>
      keys.keydown(event, document.activeElement);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [keys]);

  return keys;
};
