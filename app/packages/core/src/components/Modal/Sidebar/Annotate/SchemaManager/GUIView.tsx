import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import { ExpandLess, ExpandMore, InfoOutlined } from "@mui/icons-material";
import { Chip, Collapse, Tooltip, Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React, { useCallback, useState } from "react";
import {
  activePaths,
  addToActiveSchemas,
  inactivePaths,
  removeFromActiveSchemas,
  schema,
} from "../state";
import { Container, Item } from "./Components";
import FieldRow from "./FieldRow";
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

const ActiveFieldsSection = () => {
  const fields = useAtomValue(activePaths);

  if (!fields.length) {
    return (
      <>
        <GUISectionHeader>
          <Typography variant="body1" fontWeight={500}>
            Active fields
          </Typography>
          <Tooltip title="Fields currently active and available for dataset annotation">
            <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
          </Tooltip>
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
        <Tooltip title="Fields currently active and available for dataset annotation">
          <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
        <Chip label={fields.length} size="small" />
      </GUISectionHeader>
      {fields.map((path) => (
        <FieldRow
          key={path}
          path={path}
          isSelected={isActiveFieldSelected(path)}
          showDragHandle={true}
          hasSchema={true}
        />
      ))}
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
