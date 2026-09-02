/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * An option list portaled to the body and anchored below a trigger — the
 * machinery shared by typeahead dropdowns (the dataset selector, the view
 * bar's insert slot). Portaling escapes ancestor overflow rules; the anchor
 * rect keeps the list under its trigger through scroll and resize.
 */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
}

/**
 * The trigger's viewport rect (top = its bottom edge), recomputed on scroll
 * and resize so a portaled overlay tracks its anchor. Null while inactive.
 */
export const useAnchorRect = (
  ref: React.RefObject<HTMLElement>,
  active: boolean,
): AnchorRect | null => {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!active || !ref.current) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) {
        setRect({ top: r.bottom, left: r.left, width: r.width });
      }
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [active, ref]);

  return rect;
};

export interface AnchoredListboxProps {
  /** The trigger's rect from {@link useAnchorRect}; null renders nothing. */
  rect: AnchorRect | null;
  options: readonly string[];
  /** Highlighted option, in `options` order. */
  activeIndex: number;
  onPick: (option: string, index: number) => void;
  onHighlight: (index: number) => void;
  /** DOM id for one option, for `aria-activedescendant` wiring. */
  optionId: (index: number) => string;
  /**
   * The option's visible body; defaults to the option string in a
   * single ellipsized line.
   */
  renderOption?: (option: string, index: number) => React.ReactNode;
  /** Announced name when the visible body is more than the option's name. */
  optionAriaLabel?: (option: string) => string | undefined;
  optionDataCy?: (option: string) => string | undefined;
  optionTitle?: (option: string) => string | undefined;
  /** Highlight beyond the active row, e.g. the currently applied choice. */
  isSelected?: (option: string) => boolean;
  /**
   * Fixed list width, pulled back from the viewport's right edge when the
   * trigger sits near it; defaults to the anchor's own width.
   */
  width?: number;
  maxHeight?: number;
  /** Stacking override — a listbox inside a dialog must clear the dialog. */
  zIndex?: number;
  id?: string;
  "data-cy"?: string;
  onMount?: (el: HTMLDivElement) => void;
}

export const AnchoredListbox: React.FC<AnchoredListboxProps> = ({
  rect,
  options,
  activeIndex,
  onPick,
  onHighlight,
  optionId,
  renderOption,
  optionAriaLabel,
  optionDataCy,
  optionTitle,
  isSelected,
  width,
  maxHeight = 280,
  zIndex = 10000,
  id,
  "data-cy": dataCy,
  onMount,
}) => {
  if (!rect || options.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: rect.top + 4,
        left: width
          ? Math.min(rect.left, window.innerWidth - width - 8)
          : rect.left,
        width: width ?? rect.width,
        background: "var(--fo-palette-background-level3)",
        border: "1px solid var(--fo-palette-primary-plainBorder)",
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
        maxHeight,
        overflowY: "auto",
        zIndex,
      }}
      role="listbox"
      id={id}
      data-cy={dataCy}
      // A click on an option must not read as a click outside the trigger:
      // consumers close on outside mousedown, and the portal is outside
      onMouseDown={(e) => e.stopPropagation()}
      ref={(el) => {
        if (el) onMount?.(el);
      }}
    >
      {options.map((option, i) => (
        <div
          key={option}
          id={optionId(i)}
          role="option"
          aria-label={optionAriaLabel?.(option)}
          aria-selected={i === activeIndex}
          data-cy={optionDataCy?.(option)}
          title={optionTitle?.(option)}
          ref={(el) => {
            if (i === activeIndex) {
              el?.scrollIntoView({ block: "nearest" });
            }
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(option, i);
          }}
          onMouseEnter={() => onHighlight(i)}
          style={{
            padding: "6px 10px",
            cursor: "pointer",
            background:
              i === activeIndex || isSelected?.(option)
                ? "var(--fo-palette-background-level2)"
                : undefined,
            color: "var(--fo-palette-text-primary)",
            ...(renderOption
              ? null
              : {
                  whiteSpace: "nowrap" as const,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }),
          }}
        >
          {renderOption ? renderOption(option, i) : option}
        </div>
      ))}
    </div>,
    document.body,
  );
};

export default AnchoredListbox;
