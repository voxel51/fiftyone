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
  Card,
  CardBackground,
  EmptyState,
  FormField,
  IconName,
  Input,
  ListItem,
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

/** Reserved for the status line, so its arrival moves nothing. */
const STATUS_LINE_HEIGHT = 15;

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

  // Shown only once the expression is complete enough to be judged
  const parsed = value.trim() ? tryParse(value) : undefined;
  const settled = parsed && "error" in parsed ? parsed.error.message : null;

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
      */}
      <Card background={CardBackground.Primary} outlined compact>
        <div
          style={{
            height: RESULTS_HEIGHT,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {fieldMatches.length > 0 ? (
            <Stack orientation={Orientation.Column} spacing={Spacing.None}>
              {fieldMatches.slice(0, 24).map((path) => (
                <ListItem
                  key={path}
                  onClick={() => chooseField(path)}
                  role="option"
                  aria-selected={false}
                  style={{ cursor: "pointer" }}
                  primaryContent={
                    <Text
                      variant={TextVariant.Caption}
                      color={TextColor.Primary}
                    >
                      {path}
                    </Text>
                  }
                />
              ))}
            </Stack>
          ) : suggestions.length > 0 ? (
            <Stack orientation={Orientation.Column} spacing={Spacing.None}>
              {suggestions.map(({ operator, applicable, reason }) => (
                <Suggestion
                  key={operator.name}
                  operator={operator}
                  applicable={applicable}
                  reason={reason}
                  onChoose={() => choose(operator)}
                />
              ))}
            </Stack>
          ) : (
            <EmptyState
              icon={IconName.Add}
              title="Start with a field"
              description='Type F("…") and a dot to see what you can do with it'
            />
          )}
        </div>
      </Card>

      {/*
        One reserved line for whatever there is to say. A rejection outranks a
        parse complaint, and the line is held open when there is neither, so
        nothing below it moves as the expression is typed.
      */}
      <Text
        variant={TextVariant.Caption}
        color={error ? TextColor.Destructive : TextColor.Muted}
        style={{ minHeight: STATUS_LINE_HEIGHT }}
      >
        {error ?? settled ?? " "}
      </Text>
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
    <ListItem
      onClick={applicable ? onChoose : undefined}
      role="option"
      aria-disabled={!applicable}
      aria-selected={false}
      style={{
        cursor: applicable ? "pointer" : "not-allowed",
        opacity: applicable ? 1 : 0.55,
      }}
      primaryContent={
        <Text
          variant={TextVariant.Caption}
          color={applicable ? TextColor.Primary : TextColor.Muted}
        >
          {operator.display}
        </Text>
      }
      secondaryContent={
        <Text variant={TextVariant.Caption} color={TextColor.Muted}>
          {reason ?? operator.summary}
        </Text>
      }
      actions={<Pill size={Size.Xs}>{KIND_LABEL[operator.returns]}</Pill>}
    />
  );

  return reason ? <Tooltip content={reason}>{row}</Tooltip> : row;
};

export default ExpressionEditor;
