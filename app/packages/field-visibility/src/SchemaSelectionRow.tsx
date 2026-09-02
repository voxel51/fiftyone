/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * One schema row: checkbox, path label, doc type, and the expandable
 * metadata block.
 *
 * The e2e POM locates the checkbox as a descendant of the
 * `schema-selection-${path}` test id, so that id lives on a wrapper around
 * the checkbox input.
 */

import { useSchemaSettings } from "@fiftyone/state";
import {
  Align,
  Checkbox,
  Clickable,
  Icon,
  IconName,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useCallback } from "react";

const MAX_ROW_HEIGHT = 200;

/** One metadata line, indented under the row. */
const MetaInfoBlock: React.FC<{
  children: React.ReactNode;
  label?: string;
}> = ({ children, label }) => (
  <Stack
    orientation={Orientation.Row}
    spacing={Spacing.Xs}
    style={{ paddingLeft: "2rem" }}
  >
    {label && (
      <Text
        variant={TextVariant.Md}
        color={TextColor.Secondary}
        style={{ fontWeight: "bold" }}
      >
        {label}
      </Text>
    )}
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      {children}
    </Text>
  </Stack>
);

interface Props {
  path: string;
  isSelected: boolean;
  count: number;
  disabled: boolean;
  pathLabelFinal: string;
  docTypeLabel: string;
  isExpandable: boolean;
  info: unknown;
  description: string;
}

export const SchemaSelectionRow = (props: Props) => {
  const {
    path,
    isSelected,
    count,
    disabled,
    pathLabelFinal,
    docTypeLabel,
    isExpandable,
    info,
    description,
  } = props;
  const {
    toggleSelection,
    finalSchema,
    isFilterRuleActive,
    expandedPaths = {},
    setExpandedPaths,
  } = useSchemaSettings();
  const expandedPathsKeys = new Set(Object.keys(expandedPaths || {}));

  const renderInfo = useCallback(() => {
    if (info === undefined || info === null) return null;
    const infoType = typeof info;
    if (infoType === "number") {
      const num = info as number;
      const value = Number.isInteger(num) ? num : num.toFixed(3);
      return <MetaInfoBlock key={path + value}>{value}</MetaInfoBlock>;
    }
    if (infoType === "string") {
      const str = info as string;
      return <MetaInfoBlock key={str}>{str.length ? str : '""'}</MetaInfoBlock>;
    }
    if (infoType === "boolean") {
      const boolLabel: string = info ? "True" : "False";
      return <MetaInfoBlock key={path + boolLabel}>{boolLabel}</MetaInfoBlock>;
    }
    if (infoType === "object") {
      if (Array.isArray(info)) {
        return info.map((key) => (
          <MetaInfoBlock key={key}>{key}</MetaInfoBlock>
        ));
      }
      return Object.keys(info as object).map((key) => {
        const val = (info as Record<string, unknown>)[key] || "";
        return (
          <MetaInfoBlock key={path + key} label={`${key}:`}>
            {JSON.stringify(val)}
          </MetaInfoBlock>
        );
      });
    }
    return <MetaInfoBlock>None</MetaInfoBlock>;
  }, [info, path]);

  return (
    <div
      key={path}
      style={{
        padding: "0.25rem",
        borderBottom: "1px solid var(--fo-palette-primary-plainBorder)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack orientation={Orientation.Row} justify={Justify.Between}>
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          style={{ width: "100%", minWidth: 0 }}
        >
          <span data-cy={`schema-selection-${path}`}>
            <Checkbox
              checked={isSelected}
              disabled={disabled}
              onChange={() => toggleSelection(path, isSelected)}
              value={path}
            />
          </span>
          <span
            style={{
              paddingLeft: isFilterRuleActive
                ? "0.5rem"
                : `${(count - 1) * 15 + 5}px`,
              display: "inline-flex",
            }}
          >
            <Text
              variant={TextVariant.Lg}
              color={disabled ? TextColor.Tertiary : TextColor.Primary}
            >
              {pathLabelFinal}
            </Text>
          </span>
          <span style={{ paddingLeft: "0.5rem", display: "inline-flex" }}>
            <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
              ({docTypeLabel})
            </Text>
          </span>
        </Stack>
        {isExpandable && (
          <Clickable
            role="button"
            tabIndex={0}
            aria-label={`Expand ${path} metadata`}
            onClick={() => {
              if (expandedPathsKeys.has(path)) {
                const newPaths = Object.assign({}, expandedPaths);
                delete newPaths[path];
                setExpandedPaths(newPaths);
              } else {
                const newPaths = Object.assign({}, expandedPaths);
                const element = finalSchema.filter(
                  (sc) => sc.path === path,
                )?.[0];

                newPaths[path] = {
                  info: element?.info || "None",
                  description: element?.description || "None",
                  name: element?.name || "None",
                };
                setExpandedPaths(newPaths);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <Icon
              name={
                expandedPathsKeys.has(path)
                  ? IconName.ChevronTop
                  : IconName.ChevronBottom
              }
              size={Size.Sm}
            />
          </Clickable>
        )}
      </Stack>
      {expandedPathsKeys.has(path) && (
        <div
          data-cy={`schema-selection-info-container-${path}`}
          style={{ maxHeight: MAX_ROW_HEIGHT, overflow: "auto" }}
        >
          {renderInfo()}
          {description && (
            <MetaInfoBlock key={description} label="Description:">
              {description}
            </MetaInfoBlock>
          )}
        </div>
      )}
    </div>
  );
};
