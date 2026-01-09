import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import {
  EditOutlined,
  ExpandLess,
  ExpandMore,
  InfoOutlined,
} from "@mui/icons-material";
import { Collapse, Typography } from "@mui/material";
import {
  Anchor,
  Clickable,
  Pill,
  RichList,
  Size,
  ToggleSwitch,
  Tooltip,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React, { useCallback, useMemo, useState } from "react";
import { CodeView } from "../../../../../plugins/SchemaIO/components";
import {
  activeSchemaTab,
  activeLabelSchemas,
  activePaths,
  addToActiveSchemas,
  fieldAttributeCount,
  fieldType,
  inactiveLabelSchemas,
  inactivePaths,
  labelSchemaData,
  labelSchemasData,
  removeFromActiveSchemas,
  schema,
} from "../state";
import { Container, Item } from "./Components";
import FieldRow from "./FieldRow";
import { currentField } from "./state";
import { CollapsibleHeader, ContentArea, GUISectionHeader } from "./styled";
import { useFullSchemaEditor } from "./useFullSchemaEditor";

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

// Check if a field has schema configured (supports both atom systems)
export const fieldHasSchema = atomFamily((path: string) =>
  atom((get) => {
    // Check new schema system
    const schemaData = get(schema(path));
    if (schemaData?.config) return true;
    // Check legacy schema system (now in camelCase)
    const legacyData = get(labelSchemaData(path));
    if (legacyData?.labelSchema) return true;
    return false;
  })
);

// Check if a field is read-only
export const fieldIsReadOnly = atomFamily((path: string) =>
  atom((get) => {
    const data = get(labelSchemaData(path));
    return data?.readOnly ?? data?.labelSchema?.readOnly ?? false;
  })
);

export const useActivateFields = () => {
  const addToActiveSchema = useSetAtom(addToActiveSchemas);
  const [selected, setSelected] = useAtom(selectedHiddenFields);
  const activateFields = useOperatorExecutor("activate_label_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    addToActiveSchema(selected);
    activateFields.execute({ fields: Array.from(selected) });
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
  const deactivateFields = useOperatorExecutor("deactivate_label_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    removeFromActiveSchema(selected);
    deactivateFields.execute({ fields: Array.from(selected) });
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
    <Tooltip
      content="Configure annotation schema"
      anchor={Anchor.Bottom}
      portal
    >
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
  // Support both atom systems
  const [fieldsFromNew, setFieldsNew] = useAtom(activePaths);
  const [fieldsFromLegacy, setFieldsLegacy] = useAtom(activeLabelSchemas);
  const fields = fieldsFromNew?.length ? fieldsFromNew : fieldsFromLegacy ?? [];

  const [, setSelected] = useAtom(selectedActiveFields);
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
          secondaryContent: (
            <>
              {fieldTypes[path]}
              {fieldAttrCounts[path] > 0 && (
                <span style={{ opacity: 0.7 }}>
                  {" "}
                  • {fieldAttrCounts[path]} attribute
                  {fieldAttrCounts[path] !== 1 ? "s" : ""}
                </span>
              )}
              {fieldReadOnlyStates[path] && (
                <Pill size={Size.Md} style={{ marginLeft: 8 }}>
                  Read-only
                </Pill>
              )}
            </>
          ),
          actions: <FieldActions path={path} />,
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
            anchor={Anchor.Top}
            portal
          >
            <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
          </Tooltip>
          <Pill size={Size.Xs}>0</Pill>
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
          <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
        <Pill size={Size.Xs}>{fields.length}</Pill>
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
  const isReadOnly = useAtomValue(fieldIsReadOnly(path));

  return (
    <FieldRow
      key={path}
      path={path}
      isSelected={hasSchema ? isHiddenFieldSelected(path) : undefined}
      hasSchema={hasSchema}
      isReadOnly={isReadOnly}
    />
  );
};

// Atom to get sorted hidden fields: scanned (with schema) first, unscanned last
const sortedInactivePaths = atom((get) => {
  // Support both atom systems
  const fieldsFromNew = get(inactivePaths);
  const fieldsFromLegacy = get(inactiveLabelSchemas);
  const fields = fieldsFromNew?.length ? fieldsFromNew : fieldsFromLegacy ?? [];

  const withSchema: string[] = [];
  const withoutSchema: string[] = [];

  for (const field of fields) {
    if (get(fieldHasSchema(field))) {
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
        <Tooltip
          content="Fields currently hidden and not available for dataset annotation"
          anchor={Anchor.Top}
          portal
        >
          <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
        <Pill size={Size.Xs}>{fields.length}</Pill>
      </GUISectionHeader>
      <Collapse in={expanded}>
        {fields.map((path) => (
          <HiddenFieldRow key={path} path={path} />
        ))}
      </Collapse>
    </>
  );
};

// GUI content - field list with drag-drop
const GUIContent = () => {
  const schemasData = useAtomValue(labelSchemasData);
  console.log("GUIContent fields (labelSchemasData):", schemasData);

  return (
    <>
      <ActiveFieldsSection />
      <HiddenFieldsSection />
    </>
  );
};

// JSON content - raw schema view
const JSONContent = () => {
  const schemasData = useAtomValue(labelSchemasData);
  const { currentJson, onChange } = useFullSchemaEditor();

  if (!schemasData) {
    return (
      <Item style={{ justifyContent: "center", opacity: 0.7 }}>
        <Typography color="secondary">No schema data available</Typography>
      </Item>
    );
  }

  return (
    <ContentArea
      style={{
        position: "absolute",
        top: "50px",
        left: "2rem",
        right: "2rem",
        bottom: 0,
      }}
    >
      <CodeView
        data={currentJson}
        path="schemas"
        schema={{
          view: {
            language: "json",
            readOnly: false,
            width: "100%",
            height: "100%",
            componentsProps: {
              container: {
                style: { height: "100%" },
              },
            },
          },
        }}
        onChange={(_, value) => onChange(value)}
      />
    </ContentArea>
  );
};

const TAB_IDS = ["gui", "json"] as const;

const GUIView = () => {
  const [activeTab, setActiveTab] = useAtom(activeSchemaTab);
  const defaultIndex = TAB_IDS.indexOf(activeTab);

  const handleTabChange = useCallback(
    (index: number) => {
      setActiveTab(TAB_IDS[index]);
    },
    [setActiveTab]
  );

  return (
    <Container style={{ marginBottom: "0.5rem" }}>
      <ToggleSwitch
        size={Size.Sm}
        defaultIndex={defaultIndex}
        onChange={handleTabChange}
        tabs={[
          {
            id: "gui",
            data: {
              label: "GUI",
              content: <GUIContent />,
            },
          },
          {
            id: "json",
            data: {
              label: "JSON",
              content: <JSONContent />,
            },
          },
        ]}
      />
    </Container>
  );
};

export default GUIView;
