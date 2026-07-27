/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Edits a view expression as the Python it is written in.
 *
 * The source text is the only representation — `parse` and `print` are exact
 * inverses, so there is no builder model beside it to fall out of sync, and
 * nothing is lost by switching between clicking and typing. What the caret can
 * be offered is decided by {@link caretContext}, which reads the text directly
 * rather than the parse, so a half-typed expression still suggests well.
 */

import {
  Align,
  Anchor,
  Card,
  CardBackground,
  Icon,
  FormField,
  IconName,
  Input,
  Justify,
  Clickable,
  Orientation,
  Pill,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import React, { useCallback, useMemo, useRef, useState } from "react";

import { tryParse } from "../expression/parse";
import type { Node } from "../expression/types";
import { CATALOG } from "./catalog";
import type { Kind, Operator } from "./catalog";
import {
  caretContext,
  kindOf,
  signatureAt,
  suggestFields,
  suggestOperators,
} from "./suggest";

export interface ExpressionEditorProps {
  /** Python source for the expression, e.g. `F("confidence") > 0.5`. */
  value: string;
  onChange: (source: string) => void;
  /** Field paths the dataset has, offered while a field name is being typed. */
  fields?: string[];
  /** Resolves a field path to the kind of value it holds. */
  fieldKind?: (path: string) => Kind | undefined;
  operators?: Operator[];
  label?: string;
  /** Names the parameter from inside the input, so no label sits above it. */
  placeholder?: string;
  /** The editor switcher, laid out inline with the input it governs. */
  tabs?: React.ReactNode;
  /** Waiting on a parameter declared before it. */
  disabled?: boolean;
  /** Committed elsewhere — the editor never reports a parse error while typing. */
  error?: string | null;
}

/** How the operator is written into the source once chosen. */
const applySuggestion = (
  source: string,
  offset: number,
  operator: Operator,
): { source: string; offset: number } => {
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_]/.test(source[start - 1])) start--;

  const takesArgs = operator.maxArgs === null || operator.maxArgs > 0;
  const call = `${operator.display}(${takesArgs ? "" : ")"}`;
  const insert = takesArgs ? `${operator.display}()` : call;

  return {
    source: source.slice(0, start) + insert + source.slice(offset),
    // Land the caret inside the parentheses when there is something to type
    offset: start + operator.display.length + (takesArgs ? 1 : 2),
  };
};

/**
 * Tall enough for the empty-state hint, which is the tallest of the three
 * things this region shows, so swapping between them never moves the input.
 */
const RESULTS_HEIGHT = 148;

/**
 * What the box has to say about the expression as it stands.
 *
 * `empty` invites, `valid` confirms, `invalid` explains. A half-typed
 * expression is `invalid` and says so where the suggestions were, rather than
 * pushing a message in underneath and moving everything.
 */
export type Status =
  | { state: "empty" }
  | { state: "valid" }
  | { state: "invalid"; message: string };

export const statusOf = (source: string, error?: string | null): Status => {
  // A reason the value was rejected outranks anything read from the text
  if (error) return { state: "invalid", message: error };

  if (!source.trim()) return { state: "empty" };

  const parsed = tryParse(source);
  return "error" in parsed
    ? { state: "invalid", message: parsed.error.message }
    : { state: "valid" };
};

const STATUS_ICON: Record<Status["state"], IconName> = {
  empty: IconName.Add,
  valid: IconName.Check,
  invalid: IconName.Error,
};

const STATUS_COLOR: Record<Status["state"], TextColor> = {
  empty: TextColor.Muted,
  valid: TextColor.Success,
  invalid: TextColor.Destructive,
};

const KIND_LABEL: Record<Kind, string> = {
  ANY: "any",
  NUMBER: "number",
  STRING: "string",
  BOOLEAN: "boolean",
  ARRAY: "list",
  OBJECT: "object",
  DATE: "date",
  ID: "id",
};

export const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
  value,
  onChange,
  fields = [],
  fieldKind = () => undefined,
  operators = CATALOG,
  label,
  placeholder = 'F("confidence") > 0.5',
  tabs,
  disabled,
  error,
}) => {
  //
  // The caret offset is the whole basis for what gets suggested, and reading it
  // means holding the input element. voodo's `Input` is a plain function
  // component, so it accepts no ref and the element has to be found through the
  // wrapper. Removable once `Input` is wrapped in `forwardRef` upstream in
  // voxel51/design-system, which would also let the editor place the caret
  // without reaching into the DOM at all.
  //
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const input = () => wrapperRef.current?.querySelector("input") ?? null;
  const [offset, setOffset] = useState(value.length);

  const syncCaret = useCallback(() => {
    setOffset(input()?.selectionStart ?? value.length);
  }, [value.length]);

  const context = useMemo(
    () => caretContext(value, Math.min(offset, value.length)),
    [value, offset],
  );

  const receiverKind = useMemo(
    () =>
      context.receiver
        ? kindOf(context.receiver as Node, operators, fieldKind)
        : undefined,
    [context.receiver, operators, fieldKind],
  );

  const suggestions = useMemo(
    () =>
      receiverKind
        ? suggestOperators(receiverKind, context.prefix, operators)
        : [],
    [receiverKind, context.prefix, operators],
  );

  const signature = useMemo(
    () => signatureAt(context, operators),
    [context, operators],
  );

  const fieldMatches = useMemo(
    () => (context.field ? suggestFields(context.field.typed, fields) : []),
    [context.field, fields],
  );

  /** Writes the caret back after React has rendered the new value. */
  const restoreCaret = useCallback((at: number) => {
    requestAnimationFrame(() => {
      const el = input();
      el?.setSelectionRange(at, at);
      setOffset(at);
      el?.focus();
    });
  }, []);

  const chooseField = useCallback(
    (path: string) => {
      if (!context.field) return;
      const { start, typed } = context.field;
      const next =
        value.slice(0, start) + path + value.slice(start + typed.length);
      onChange(next);
      restoreCaret(start + path.length);
    },
    [context.field, value, onChange, restoreCaret],
  );

  const choose = useCallback(
    (operator: Operator) => {
      const next = applySuggestion(value, offset, operator);
      onChange(next.source);
      restoreCaret(next.offset);
    },
    [value, offset, onChange, restoreCaret],
  );

  const status = statusOf(value, error);

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <FormField
        label={label}
        description={
          signature ? (
            <Signature
              operator={signature.operator}
              argIndex={signature.argIndex}
              argKind={signature.argKind}
            />
          ) : (
            receiverKind && (
              <Text variant={TextVariant.Caption} color={TextColor.Muted}>
                {KIND_LABEL[receiverKind]}
              </Text>
            )
          )
        }
        control={
          <Stack
            orientation={Orientation.Row}
            spacing={Spacing.Sm}
            align={Align.Center}
          >
            {tabs}
            <div ref={wrapperRef} style={{ flex: 1, minWidth: 0 }}>
              <Input
                disabled={disabled}
                size={Size.Sm}
                value={value}
                placeholder={placeholder}
                spellCheck={false}
                onChange={(e) => {
                  onChange(e.target.value);
                  setOffset(e.target.selectionStart ?? e.target.value.length);
                }}
                onKeyUp={syncCaret}
                onClick={syncCaret}
                onSelect={syncCaret}
              />
            </div>
          </Stack>
        }
      />

      {/*
        One slot, one height. The hint, the field list and the operator list
        are alternatives for the same region, so it is sized once — otherwise
        the popover grows and shrinks under the caret as they swap.

        Only the lists scroll. The hint is a fixed thing that fits, and a
        scrollbar on it suggests there is more to read when there is not.
      */}
      <Card
        background={CardBackground.Primary}
        outlined
        compact
        style={
          status.state === "invalid"
            ? { borderColor: "var(--fo-palette-error-plainColor)" }
            : undefined
        }
      >
        <div
          style={{
            height: RESULTS_HEIGHT,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {fieldMatches.length > 0 ? (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              {fieldMatches.slice(0, 24).map((path) => (
                <Row key={path} onChoose={() => chooseField(path)}>
                  {path}
                </Row>
              ))}
            </div>
          ) : suggestions.length > 0 ? (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              {suggestions.map(({ operator, applicable, reason }) => (
                <Suggestion
                  key={operator.name}
                  operator={operator}
                  applicable={applicable}
                  reason={reason}
                  onChoose={() => choose(operator)}
                />
              ))}
            </div>
          ) : (
            <Stack
              orientation={Orientation.Column}
              justify={Justify.Center}
              align={Align.Center}
              spacing={Spacing.Xs}
              style={{ flex: 1, overflow: "hidden", textAlign: "center" }}
            >
              <Icon
                name={STATUS_ICON[status.state]}
                size={Size.Sm}
                color={STATUS_COLOR[status.state]}
              />
              <Text variant={TextVariant.Sm} color={STATUS_COLOR[status.state]}>
                {status.state === "invalid"
                  ? status.message
                  : status.state === "valid"
                    ? "Ready to apply"
                    : "Start with a field"}
              </Text>
              {status.state === "empty" && (
                <Text variant={TextVariant.Caption} color={TextColor.Muted}>
                  {'Type F("…") then a dot'}
                </Text>
              )}
            </Stack>
          )}
        </div>
      </Card>
    </Stack>
  );
};

const Signature: React.FC<{
  operator: Operator;
  argIndex: number;
  argKind: Kind;
}> = ({ operator, argIndex, argKind }) => (
  <Stack
    orientation={Orientation.Row}
    spacing={Spacing.Xs}
    style={{ alignItems: "center" }}
  >
    <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
      {operator.display}(arg {argIndex + 1})
    </Text>
    <Pill size={Size.Xs}>{KIND_LABEL[argKind]}</Pill>
    <Text variant={TextVariant.Caption} color={TextColor.Muted}>
      {operator.summary}
    </Text>
  </Stack>
);

/**
 * One line, one thing to pick.
 *
 * `MenuTextItem` is the design system's compact row but it is a headlessui
 * menu item and throws without a `Menu` above it, which an always-open list
 * inside a popover has no reason to be. `Clickable` carries the affordance and
 * the text component carries the type, so the row stays a row.
 */
const Row: React.FC<
  React.PropsWithChildren<{ onChoose?: () => void; muted?: boolean }>
> = ({ onChoose, muted, children }) => (
  <Clickable
    onClick={onChoose}
    role="option"
    aria-selected={false}
    aria-disabled={!onChoose}
    style={{
      display: "block",
      padding: "3px 6px",
      borderRadius: 3,
      opacity: onChoose ? 1 : 0.6,
      cursor: onChoose ? "pointer" : "not-allowed",
    }}
  >
    <Text
      variant={TextVariant.Sm}
      color={muted ? TextColor.Muted : TextColor.Primary}
    >
      {children}
    </Text>
  </Clickable>
);

/**
 * An operator that does not apply is offered anyway, carrying its reason —
 * hiding it is only legible to someone who already knows the type system.
 */
const Suggestion: React.FC<{
  operator: Operator;
  applicable: boolean;
  reason?: string;
  onChoose: () => void;
}> = ({ operator, applicable, reason, onChoose }) => {
  const row = (
    <Row onChoose={applicable ? onChoose : undefined} muted={!applicable}>
      {operator.display}
    </Row>
  );

  return reason ? (
    <Tooltip content={reason} anchor={Anchor.Right}>
      {row}
    </Tooltip>
  ) : (
    row
  );
};

export default ExpressionEditor;
