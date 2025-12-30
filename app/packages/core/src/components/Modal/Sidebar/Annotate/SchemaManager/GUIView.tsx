import { Tooltip } from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import { ExpandLess, ExpandMore, InfoOutlined } from "@mui/icons-material";
import {
  Chip,
  Collapse,
  Tooltip as MuiTooltip,
  Typography,
} from "@mui/material";
import { RichList, Clickable, Pill, Size } from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React, { useCallback, useMemo, useState } from "react";
import { EditOutlined } from "@mui/icons-material";
import {
  activePaths,
  addToActiveSchemas,
  inactivePaths,
  removeFromActiveSchemas,
  schema,
  fieldType,
} from "../state";
import { Container, Item } from "./Components";
import FieldRow from "./FieldRow";
import { currentField } from "./state";
import { CollapsibleHeader, GUISectionHeader } from "./styled";

// Selection state for active fields
export const selectedActiveFields = atom(new Set<string>());
export const isActiveFieldSelected = atomFamily((path: string) =>
  atom(
    (get) => get(selectedActiveFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(selectedActiveFields));
      toggle ? selected.add(path) : selected.delete(path);
      set(selectedActiveFields, selected);
      // Clear hidden fields selection when selecting active fields
      if (toggle) {
        set(selectedHiddenFields, new Set());
      }
    }
  )
);

// Selection state for hidden fields
export const selectedHiddenFields = atom(new Set<string>());
export const isHiddenFieldSelected = atomFamily((path: string) =>
  atom(
    (get) => get(selectedHiddenFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(selectedHiddenFields));
      toggle ? selected.add(path) : selected.delete(path);
      set(selectedHiddenFields, selected);
      // Clear active fields selection when selecting hidden fields
      if (toggle) {
        set(selectedActiveFields, new Set());
      }
    }
  )
);

// Check if a field has schema configured
export const fieldHasSchema = atomFamily((path: string) =>
  atom((get) => !!get(schema(path))?.config)
);

export const useActivateFields = () => {
  const addToActiveSchema = useSetAtom(addToActiveSchemas);
  const [selected, setSelected] = useAtom(selectedHiddenFields);
  const activateFields = useOperatorExecutor("activate_annotation_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    addToActiveSchema(selected);
    activateFields.execute({ paths: Array.from(selected) });
    setSelected(new Set());
    setMessage({
      msg: `${selected.size} schema${
        selected.size > 1 ? "s" : ""
      } moved to active fields`,
      variant: "success",
    });
  }, [activateFields, addToActiveSchema, selected, setSelected, setMessage]);
};

export const useDeactivateFields = () => {
  const removeFromActiveSchema = useSetAtom(removeFromActiveSchemas);
  const [selected, setSelected] = useAtom(selectedActiveFields);
  const deactivateFields = useOperatorExecutor("deactivate_annotation_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    removeFromActiveSchema(selected);
    deactivateFields.execute({ paths: Array.from(selected) });
    setSelected(new Set());
    setMessage({
      msg: `${selected.size} schema${
        selected.size > 1 ? "s" : ""
      } moved to hidden fields`,
      variant: "success",
    });
  }, [
    deactivateFields,
    removeFromActiveSchema,
    selected,
    setSelected,
    setMessage,
  ]);
};

// Helper to build actions for a field row
const FieldActions = ({ path }: { path: string }) => {
  const setField = useSetAtom(currentField);

  return (
    <Tooltip placement="top-center" text="Configure annotation schema">
      <Clickable
        style={{ padding: 4, height: 29, width: 29 }}
        onClick={() => setField(path)}
      >
        <EditOutlined fontSize="small" />
      </Clickable>
    </Tooltip>
  );
};

const ActiveFieldsSection = () => {
  const [fields, setFields] = useAtom(activePaths);
  const [selected, setSelected] = useAtom(selectedActiveFields);
  const fieldTypes = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(fields.map((f) => [f, get(fieldType(f))]))
        ),
      [fields]
    )
  );

  const listItems = useMemo(
    () =>
      fields.map((path) => ({
        id: path,
        data: {
          canSelect: true,
          canDrag: true,
          primaryContent: path,
          secondaryContent: fieldTypes[path],
          actions: <FieldActions path={path} />,
        } as ListItemProps,
      })),
    [fields, fieldTypes]
  );

  const handleOrderChange = useCallback(
    (newItems: { id: string; data: ListItemProps }[]) => {
      setFields(newItems.map((item) => item.id));
    },
    [setFields]
  );

  const handleSelected = useCallback(
    (selectedIds: string[]) => {
      setSelected(new Set(selectedIds));
    },
    [setSelected]
  );

  if (!fields.length) {
    return (
      <>
        <GUISectionHeader>
          <Typography variant="body1" fontWeight={500}>
            Active fields
          </Typography>
          <MuiTooltip title="Fields currently active and available for dataset annotation">
            <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
          </MuiTooltip>
          <Chip label="0" size="small" />
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
        <MuiTooltip title="Fields currently active and available for dataset annotation">
          <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
        </MuiTooltip>
        <Chip label={fields.length} size="small" />
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

const HiddenFieldRow = ({ path }: { path: string }) => {
  const hasSchema = useAtomValue(fieldHasSchema(path));

  return (
    <FieldRow
      key={path}
      path={path}
      isSelected={hasSchema ? isHiddenFieldSelected(path) : undefined}
      hasSchema={hasSchema}
    />
  );
};

// Atom to get sorted hidden fields: scanned (with schema) first, unscanned last
const sortedInactivePaths = atom((get) => {
  const fields = get(inactivePaths);
  const withSchema: string[] = [];
  const withoutSchema: string[] = [];

  for (const field of fields) {
    if (get(schema(field))?.config) {
      withSchema.push(field);
    } else {
      withoutSchema.push(field);
    }
  }

  return [...withSchema, ...withoutSchema];
});

const HiddenFieldsSection = () => {
  const fields = useAtomValue(sortedInactivePaths);
  const [expanded, setExpanded] = useState(true);

  if (!fields.length) {
    return null;
  }

  return (
    <>
      <GUISectionHeader>
        <CollapsibleHeader
          onClick={() => setExpanded(!expanded)}
          style={{ padding: 0, flex: "none" }}
        >
          <Typography variant="body1" fontWeight={500}>
            Hidden fields
          </Typography>
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </CollapsibleHeader>
        <Tooltip title="Fields currently hidden and not available for dataset annotation">
          <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
        <Chip label={fields.length} size="small" />
      </GUISectionHeader>
      <Collapse in={expanded}>
        {fields.map((path) => (
          <HiddenFieldRow key={path} path={path} />
        ))}
      </Collapse>
    </>
  );
};

const GUIView = () => {
  return (
    <Container style={{ marginBottom: "4rem" }}>
      <ActiveFieldsSection />
      <HiddenFieldsSection />
    </Container>
  );
};

export default GUIView;
