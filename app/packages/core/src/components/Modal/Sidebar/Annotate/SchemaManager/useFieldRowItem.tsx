/**
 * One overview row as a voodo RichList item: name, type/attribute
 * summary, and the Setup / Configure actions.
 */

import type { ListItemProps } from "@voxel51/voodo";
import {
  Anchor,
  Button,
  Icon,
  IconName,
  Pill,
  Size,
  Text,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { useCallback } from "react";
import type { RowData } from "./overviewRows";
import type { OverviewStyles } from "./overviewStyles";
import SecondaryText from "./SecondaryText";
import { PROTECTED_PATHS } from "./useSchemaDocs";

export const useFieldRowItem = ({
  rowTypes,
  rowAttrCounts,
  docMode,
  styles,
  setCurrentField,
  setUpField,
}: {
  rowTypes: Record<string, unknown>;
  rowAttrCounts: Record<string, number>;
  docMode: boolean;
  styles: OverviewStyles;
  setCurrentField: (path: string) => void;
  setUpField: (row: RowData) => void;
}) => {
  const buildItem = useCallback(
    (row: RowData, draggable: boolean) => {
      const type = rowTypes[row.path];
      const attrCount = rowAttrCounts[row.path];
      const actionable = !row.system && !row.unsupported;
      const canOpen = row.setUp && actionable;
      const hidden = row.tier === "hidden";
      // Checkboxes drive the footer's Active ↔ Hidden move; only custom
      // schemas hide, and protected fields can never be hidden. Fields
      // that cannot be annotated can still be hidden.
      const canSelect =
        docMode && !row.system && (hidden || !PROTECTED_PATHS.has(row.path));
      return {
        id: row.path,
        data: {
          canSelect,
          canDrag: draggable,
          "data-cy": `field-row-${row.path}`,
          primaryContent: (
            <span style={styles.fieldName} title={row.path}>
              {row.path}
            </span>
          ),
          secondaryContent: (
            <SecondaryText
              fieldType={type ? String(type) : ""}
              attrCount={attrCount}
              isSystemReadOnly={row.system}
            />
          ),
          actions: (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              {row.unsupported ? <Pill size={Size.Md}>Unsupported</Pill> : null}
              {row.system ? <Pill size={Size.Md}>System</Pill> : null}
              {canOpen ? (
                <Tooltip
                  content={<Text>Configure label schema</Text>}
                  anchor={Anchor.Bottom}
                  portal
                >
                  <Button
                    variant={Variant.Icon}
                    borderless
                    data-cy="edit"
                    onClick={() => setCurrentField(row.path)}
                  >
                    <Icon name={IconName.Edit} size={Size.Md} />
                  </Button>
                </Tooltip>
              ) : null}
              {actionable && !hidden && !row.setUp ? (
                <Tooltip
                  content={
                    <Text>Scan the field to set it up for annotation</Text>
                  }
                  anchor={Anchor.Bottom}
                  portal
                >
                  <Button
                    data-cy="scan"
                    size={Size.Sm}
                    variant={Variant.Secondary}
                    onClick={() => setUpField(row)}
                  >
                    Setup
                  </Button>
                </Tooltip>
              ) : null}
            </span>
          ),
        } as ListItemProps,
      };
    },
    [rowTypes, rowAttrCounts, docMode, styles, setCurrentField, setUpField],
  );

  return buildItem;
};
