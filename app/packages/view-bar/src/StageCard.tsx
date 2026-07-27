/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * One stage in the bar: a compact pill showing what it does, and the popover
 * that edits it.
 */

import {
  Align,
  Card,
  CardBackground,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
} from "@voxel51/voodo";
import React from "react";
import { createPortal } from "react-dom";

import type { Kind, Operator } from "./builder/catalog";
import { ParamInput } from "./controls";
import {
  blockedBy,
  expressionScope,
  isEmptyValue,
  isPrivate,
  pickInput,
  rows,
} from "./params";
import type { InputKind, ParamDef, StageDefinition } from "./params";
import type { WorkingStage } from "./state";

/**
 * Anchor-rect hook for portaled dropdowns. Returns the trigger
 * element's viewport rect (top/left/width), recomputed on scroll
 * and resize so the portaled overlay tracks its anchor.
 */
export const useAnchorRect = (
  ref: React.RefObject<HTMLElement>,
  active: boolean,
) => {
  const [rect, setRect] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  React.useEffect(() => {
    if (!active || !ref.current) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom, left: r.left, width: r.width });
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

/** Every stage's editor is this wide, so none of them surprises the next. */
const POPOVER_WIDTH = 360;

interface StageCardProps {
  stage: WorkingStage;
  definition: StageDefinition;
  /** Every field path in the dataset, for scoping an expression to a field. */
  allPaths: readonly string[];
  fieldOptions: { id: string; data: { label: string } }[];
  /** The field paths a param accepts, narrowed by the constraints it declares. */
  allowedFor: (param: ParamDef) => string[];
  /** The served operator catalog, for expression suggestions. */
  operators?: Operator[];
  /** Resolves a full field path to the kind of value it holds. */
  fieldKind?: (path: string) => Kind | undefined;
  /** The editor switcher, for controls that lay it out themselves. */
  tabs?: React.ReactNode;
  /** Why each of this stage's params was rejected, by param name. */
  errors: ReadonlyMap<string, string>;
  /** The stage cannot be applied as it stands. */
  invalid: boolean;
  /** The control in force for each param, by param name. */
  kinds: ReadonlyMap<string, InputKind>;
  onModeChange: (param: string, kind: InputKind) => void;
  expanded: boolean;
  onToggle: () => void;
  onChange: (name: string, value: unknown) => void;
  onRemove: () => void;
  /** The stage is done being described; close it and move on. */
  onCommit: () => void;
}

/**
 * Render a kwarg value as a short preview string for the collapsed
 * stage card. Keeps strings under ~24 chars; lists show the first item
 * with a `+N` tail; numbers/booleans show as-is.
 */
const previewValue = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const head = String(value[0] ?? "");
    return value.length > 1 ? `${head} +${value.length - 1}` : head;
  }
  const s = String(value);
  return s.length > 24 ? `${s.slice(0, 21)}…` : s;
};

export const StageCard: React.FC<StageCardProps> = ({
  stage,
  definition,
  fieldOptions,
  allPaths,
  invalid,
  allowedFor,
  operators,
  fieldKind,
  errors,
  kinds,
  onModeChange,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onCommit,
}) => {
  const firstParam = definition.params[0];
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const popoverContentRef = React.useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(triggerRef, expanded);

  // A stage still missing required values cannot be finished with Enter, and
  // wears a red outline while its editor is closed
  const incomplete = definition.params.some(
    (param) =>
      !isPrivate(param) &&
      param.required &&
      isEmptyValue(stage.kwargs[param.name]),
  );

  //
  // The stage was just added or just clicked; either way the next thing the
  // user wants is to type into it.
  //
  // Depends on `rect` as well as `expanded`, because the popover is portaled
  // and only mounts once the anchor has been measured — one render after
  // `expanded` turns true. Watching `expanded` alone looks for the input
  // before it exists.
  //
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!expanded) {
      focused.current = false;
      return;
    }

    // `rect` is remeasured on every scroll; focus belongs to the user after
    // the first time, not to whichever effect ran last
    if (!rect || focused.current) return;
    focused.current = true;

    const popover = popoverContentRef.current;
    // Not a combobox: voodo's Select opens its options on focus, and opening
    // a dropdown nobody asked for is not what starting the keyboard means
    const typeable = popover?.querySelector<HTMLElement>(
      "input:not([disabled]):not([role='combobox']), textarea:not([disabled])",
    );

    // Otherwise the popover itself takes focus, so Tab reaches the first
    // control in one keystroke and Escape and Enter already work
    (typeable ?? popover)?.focus();
  }, [expanded, rect]);

  // Outside-click closes the editing popover. Must check the trigger (so
  // re-clicking the card doesn't close-then-immediately-reopen), the portaled
  // popover content (so interacting with form fields inside doesn't close it),
  // and the layer a portaled dropdown opens into — a select's options render
  // outside this subtree, and picking one is not a click away.
  React.useEffect(() => {
    if (!expanded) return undefined;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      const element = t instanceof Element ? t : null;

      if (
        triggerRef.current?.contains(t) ||
        popoverContentRef.current?.contains(t) ||
        element?.closest("[data-headlessui-portal]") ||
        // Already detached: the click landed on something that has since gone,
        // which is what a menu closing under the pointer looks like
        !t.isConnected
      ) {
        return;
      }

      onToggle();
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [expanded, incomplete, onToggle]);

  return (
    <div
      ref={triggerRef}
      style={{ position: "relative" }}
      data-cy="view-stage-container"
    >
      <Card
        background={CardBackground.Primary}
        outlined
        compact
        style={
          !expanded && invalid
            ? { borderColor: "var(--fo-palette-error-plainColor)" }
            : undefined
        }
      >
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          align={Align.Center}
        >
          {/* Always-visible compact preview: name + first-arg value.
              Click opens the editing popover below. */}
          <div
            onClick={onToggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }}
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer", display: "inline-flex", gap: 6 }}
            title={expanded ? "Close editor" : "Edit stage"}
          >
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {definition.name}
            </span>
            {firstParam && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--fo-palette-text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                {previewValue(stage.kwargs[firstParam.name])}
              </span>
            )}
          </div>

          <div
            onClick={onRemove}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRemove();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Remove stage"
            title="Remove stage"
            style={{ cursor: "pointer", display: "inline-flex", padding: 2 }}
          >
            <Icon name={IconName.Close} size={Size.Sm} />
          </div>
        </Stack>
      </Card>

      {/* Editing popover — portaled to document.body so it escapes
          the bar's overflow clipping. Surface matches the stage
          pill (voodo `Card.Primary` = Card1 token) so the popover
          reads as a continuation of the clicked pill, not a
          separate lighter overlay. */}
      {expanded &&
        rect &&
        createPortal(
          <div
            ref={popoverContentRef}
            tabIndex={-1}
            data-cy="view-stage-editor"
            onKeyDown={(e) => {
              // Enter finishes the stage and hands the keyboard to Apply, so a
              // second Enter runs the view. The code editor keeps its newlines,
              // and a stage still missing a required value is not finished.
              if (e.key !== "Enter" || e.shiftKey || incomplete) return;
              if ((e.target as Element).closest?.(".monaco-editor")) return;

              e.preventDefault();
              onCommit();
            }}
            style={{
              position: "fixed",
              top: rect.top + 6,
              left: rect.left,
              zIndex: 10000,
              // One width for every stage. Sizing to content made the popover
              // jump as the editor changed and gave two stages holding the
              // same parameter two different shapes
              width: POPOVER_WIDTH,
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
              borderRadius: 6,
            }}
          >
            <Card background={CardBackground.Primary} outlined compact>
              {/* Each control names itself — text inputs through their
                  placeholder, toggles through their label — so there is no
                  label column and no gutter beside the narrow controls. */}
              <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                {rows(
                  definition.params.filter((p) => !isPrivate(p)),
                  (p) => kinds.get(p.name) ?? pickInput(p),
                ).map((row) => (
                  <Stack
                    key={row.map((p) => p.name).join(",")}
                    orientation={
                      row.length > 1 ? Orientation.Row : Orientation.Column
                    }
                    spacing={Spacing.Md}
                    style={row.length > 1 ? { flexWrap: "wrap" } : undefined}
                  >
                    {row.map((p) => (
                      <ParamInput
                        key={p.name}
                        param={p}
                        value={stage.kwargs[p.name]}
                        error={errors.get(p.name)}
                        disabled={
                          blockedBy(p, definition.params, stage.kwargs) !== null
                        }
                        kind={kinds.get(p.name) ?? pickInput(p)}
                        onModeChange={(kind) => onModeChange(p.name, kind)}
                        onChange={(v) => onChange(p.name, v)}
                        fieldOptions={fieldOptions}
                        allowedFor={allowedFor}
                        operators={operators}
                        fieldKind={fieldKind}
                        scope={expressionScope(
                          p,
                          definition.params,
                          stage.kwargs,
                        )}
                        allPaths={allPaths}
                        lowered={stage.lowered[p.name]}
                        testId={`view-stage-param-${p.name}`}
                      />
                    ))}
                  </Stack>
                ))}
              </Stack>
            </Card>
          </div>,
          document.body,
        )}
    </div>
  );
};
