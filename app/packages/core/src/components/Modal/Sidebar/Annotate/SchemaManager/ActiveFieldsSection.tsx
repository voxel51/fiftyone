/**
 * Active Fields Section Component
 *
 * Displays the list of active (visible) fields with drag-drop reordering.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { Typography } from "@mui/material";
import {
  Anchor,
  Clickable,
  Icon,
  IconName,
  Pill,
  RichList,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import {
  activeLabelSchemas,
  activePaths,
  fieldAttributeCount,
  fieldType,
} from "../state";
import { currentField, fieldIsReadOnly, selectedActiveFields } from "./state";
import { GUISectionHeader } from "./styled";
import { Item } from "./Components";
import { buildFieldSecondaryContent } from "./utils";

/**
 * Edit action button for field rows
 */
const FieldActions = ({ path }: { path: string }) => {
  const setField = useSetAtom(currentField);

  return (
    <Tooltip
      content="Configure annotation schema"
      anchor={Anchor.Bottom}
      portal
    >
      <Clickable onClick={() => setField(path)}>
        <Icon name={IconName.Edit} size={Size.Md} />
      </Clickable>
    </Tooltip>
  );
};

const ActiveFieldsSection = () => {
  // Support both atom systems
  const [fieldsFromNew, setFieldsNew] = useAtom(activePaths);
  const [fieldsFromLegacy, setFieldsLegacy] = useAtom(activeLabelSchemas);
  const fields = fieldsFromNew?.length ? fieldsFromNew : fieldsFromLegacy ?? [];

  const [, setSelected] = useAtom(selectedActiveFields);

  // Batch field data fetching
  const fieldTypes = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(fields.map((f) => [f, get(fieldType(f))]))
        ),
      [fields]
    )
  );

  const fieldReadOnlyStates = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(fields.map((f) => [f, get(fieldIsReadOnly(f))]))
        ),
      [fields]
    )
  );

  const fieldAttrCounts = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(
            fields.map((f) => [f, get(fieldAttributeCount(f))])
          )
        ),
      [fields]
    )
  );

  // Operator to persist field order to DB
  const setActiveSchemas = useOperatorExecutor("set_active_label_schemas");

  const listItems = useMemo(
    () =>
      fields.map((path) => ({
        id: path,
        data: {
          canSelect: true,
          canDrag: true,
          primaryContent: path,
          secondaryContent: buildFieldSecondaryContent(
            fieldTypes[path],
            fieldAttrCounts[path],
            false
          ),
          actions: (
            <span className="flex items-center gap-2">
              {fieldReadOnlyStates[path] && (
                <Pill size={Size.Md}>Read-only</Pill>
              )}
              <FieldActions path={path} />
            </span>
          ),
        } as ListItemProps,
      })),
    [fields, fieldTypes, fieldAttrCounts, fieldReadOnlyStates]
  );

  const handleOrderChange = useCallback(
    (newItems: { id: string; data: ListItemProps }[]) => {
      const newOrder = newItems.map((item) => item.id);
      // Update UI immediately
      setFieldsNew(newOrder);
      setFieldsLegacy(newOrder);
      // Persist to DB
      setActiveSchemas.execute({ fields: newOrder });
    },
    [setFieldsNew, setFieldsLegacy, setActiveSchemas]
  );

  const handleSelected = useCallback(
    (selectedIds: string[]) => {
      setSelected(new Set(selectedIds));
    },
    [setSelected]
  );

  if (!fields?.length) {
    return (
      <>
        <GUISectionHeader>
          <Typography variant="body1" fontWeight={500}>
            Active fields
          </Typography>
          <Tooltip
            content="Fields currently active and available for dataset annotation"
            anchor={Anchor.Bottom}
            portal
          >
            <Icon name={IconName.Info} size={Size.Md} />
          </Tooltip>
          <Pill size={Size.Md}>0</Pill>
        </GUISectionHeader>
        <Item style={{ justifyContent: "center", opacity: 0.7 }}>
          <Typography color="secondary">No active fields</Typography>
        </Item>
      </>
    );
  }

  return (
    <>
      <GUISectionHeader>
        <Typography variant="body1" fontWeight={500}>
          Active fields
        </Typography>
        <Tooltip
          content="Fields currently active and available for dataset annotation"
          anchor={Anchor.Top}
          portal
        >
          <Icon name={IconName.Info} size={Size.Md} />
        </Tooltip>
        <Pill size={Size.Md}>{fields.length}</Pill>
      </GUISectionHeader>
      <RichList
        listItems={listItems}
        draggable={true}
        onOrderChange={handleOrderChange}
        onSelected={handleSelected}
      />
    </>
  );
};

export default ActiveFieldsSection;
