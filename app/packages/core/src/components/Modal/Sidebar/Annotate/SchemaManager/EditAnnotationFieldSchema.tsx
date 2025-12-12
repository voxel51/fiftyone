import { LoadingSpinner } from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import {
  DeleteOutlined,
  DragIndicator,
  EditOutlined,
  Sync,
} from "@mui/icons-material";
import {
  Box,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { CodeView } from "../../../../../plugins/SchemaIO/components";
import { RoundButtonWhite } from "../Actions";
import { activePaths, fieldType, inactivePaths, schemaConfig } from "../state";
import Footer from "./Footer";
import { currentField } from "./state";

// Types
interface AttributeConfig {
  type: string;
  options?: string[];
  readOnly?: boolean;
}

interface ClassConfig {
  attributes?: Record<string, AttributeConfig>;
}

interface SchemaConfigType {
  classes?: Record<string, ClassConfig>;
  attributes?: Record<string, AttributeConfig>;
}

// Styled components
const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-bottom: 64px;
`;

const Section = styled.div`
  margin-bottom: 1.5rem;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
`;

const FieldRow = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const FieldColumn = styled.div`
  flex: 1;
`;

const Label = styled(Typography)`
  margin-bottom: 0.5rem !important;
  color: ${({ theme }) => theme.text.secondary};
`;

const SchemaSection = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const TabsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.divider};
  border-radius: 4px;
`;

const ListContainer = styled.div`
  padding: 1rem;
`;

const ItemRow = styled.div`
  display: flex;
  align-items: center;
  background: ${({ theme }) => theme.background.level1};
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  gap: 0.75rem;
`;

const ItemContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ItemActions = styled.div`
  display: flex;
  gap: 0.25rem;
`;

const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.text.secondary};
  border-radius: 4px;

  &:hover {
    background: ${({ theme }) => theme.background.level2};
    color: ${({ theme }) => theme.text.primary};
  }
`;

const EmptyState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  color: ${({ theme }) => theme.text.secondary};
  background: ${({ theme }) => theme.background.level1};
  border-radius: 4px;
`;

const Badge = styled.span`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.divider};
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  color: ${({ theme }) => theme.text.secondary};
`;

const AddButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.text.secondary};
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 14px;

  &:hover {
    color: ${({ theme }) => theme.text.primary};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  gap: 1rem;
`;

const ScanButton = styled(RoundButtonWhite)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

// Tab styles
const tabsStyles = {
  minHeight: 36,
  "& .MuiTabs-flexContainer": {
    height: 36,
  },
  "& .MuiTab-root": {
    minHeight: 36,
    height: 36,
    padding: "7px 16px",
    minWidth: "unset",
    textTransform: "none",
    border: "1px solid",
    borderColor: "divider",
    borderRight: "none",
    "&:first-of-type": {
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
    },
    "&:last-of-type": {
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      borderRight: "1px solid",
      borderRightColor: "divider",
    },
    "&.Mui-selected": {
      backgroundColor: "background.paper",
    },
  },
};

// Helper functions
const toStr = (config: SchemaConfigType | undefined) =>
  JSON.stringify(config, undefined, 2);
const parse = (config: string): SchemaConfigType => JSON.parse(config);

const getAttributeTypeLabel = (type: string): string => {
  const typeMap: Record<string, string> = {
    radio: "Radio group",
    checkbox: "Checkbox",
    dropdown: "Dropdown",
    text: "Text",
    number: "Number",
  };
  return typeMap[type] || type;
};

// Custom hook for annotation schema management
const useAnnotationSchema = (path: string) => {
  const [loading, setLoading] = useState<"loading" | "scanning" | false>(false);
  const [config, setConfig] = useAtom(schemaConfig(path));
  const [localConfig, setLocalConfig] = useState<SchemaConfigType | undefined>(
    config
  );
  const [localConfigStr, setLocalConfigStr] = useState(toStr(config));

  const compute = useOperatorExecutor("compute_annotation_schema");
  const save = useOperatorExecutor("save_annotation_schema");
  const setNotification = useNotification();

  useEffect(() => {
    if (!compute.result) return;
    setLoading(false);
    const newConfig = compute.result.config as SchemaConfigType;
    setLocalConfig(newConfig);
    setLocalConfigStr(toStr(newConfig));
  }, [compute.result]);

  useEffect(() => {
    if (save.result) {
      setConfig(save.result.config);
    }
  }, [save.result, setConfig]);

  const hasChanges = useMemo(() => {
    try {
      return !isEqual(config, localConfig);
    } catch {
      return true;
    }
  }, [config, localConfig]);

  const updateFromJson = useCallback((jsonStr: string) => {
    setLocalConfigStr(jsonStr);
    try {
      setLocalConfig(parse(jsonStr));
    } catch {
      // Invalid JSON, keep the string but don't update the object
    }
  }, []);

  const updateFromGui = useCallback((newConfig: SchemaConfigType) => {
    setLocalConfig(newConfig);
    setLocalConfigStr(toStr(newConfig));
  }, []);

  return {
    compute: (scan = true) => {
      setLoading(scan ? "scanning" : "loading");
      compute.execute({ path, scan_samples: scan });
    },
    loading,
    scanning: loading === "scanning",
    reset: () => {
      setLocalConfig(config);
      setLocalConfigStr(toStr(config));
    },
    save: () => {
      if (!localConfig) {
        setNotification({ msg: "No schema to save", variant: "error" });
        return;
      }
      try {
        save.execute({ path, config: localConfig });
        setConfig(localConfig);
      } catch {
        setNotification({ msg: "Unable to save config", variant: "error" });
      }
    },
    saving: save.isExecuting,
    savingComplete: save.hasExecuted,
    config: localConfig,
    configStr: localConfigStr,
    setConfigStr: updateFromJson,
    setConfig: updateFromGui,
    hasChanges,
    hasSchema: !!localConfig,
  };
};

// Class row component
const ClassRow = ({
  name,
  attributeCount,
  onDelete,
  onEdit,
}: {
  name: string;
  attributeCount: number;
  onDelete: () => void;
  onEdit: () => void;
}) => (
  <ItemRow>
    <DragIndicator
      fontSize="small"
      sx={{ color: "text.secondary", cursor: "grab" }}
    />
    <ItemContent>
      <Typography fontWeight={500}>{name}</Typography>
      <Typography color="secondary" variant="body2">
        {attributeCount} attribute{attributeCount !== 1 ? "s" : ""}
      </Typography>
    </ItemContent>
    <ItemActions>
      <IconButton onClick={onDelete}>
        <DeleteOutlined fontSize="small" />
      </IconButton>
      <IconButton onClick={onEdit}>
        <EditOutlined fontSize="small" />
      </IconButton>
    </ItemActions>
  </ItemRow>
);

// Attribute row component
const AttributeRow = ({
  name,
  type,
  optionCount,
  readOnly,
  onDelete,
  onEdit,
}: {
  name: string;
  type: string;
  optionCount?: number;
  readOnly?: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) => (
  <ItemRow>
    <DragIndicator
      fontSize="small"
      sx={{ color: "text.secondary", cursor: "grab" }}
    />
    <ItemContent>
      <Typography fontWeight={500}>{name}</Typography>
      <Typography color="secondary" variant="body2">
        {getAttributeTypeLabel(type)}
        {optionCount !== undefined &&
          ` · ${optionCount} option${optionCount !== 1 ? "s" : ""}`}
      </Typography>
      {readOnly && <Badge>Read-only</Badge>}
    </ItemContent>
    <ItemActions>
      <IconButton onClick={onDelete}>
        <DeleteOutlined fontSize="small" />
      </IconButton>
      <IconButton onClick={onEdit}>
        <EditOutlined fontSize="small" />
      </IconButton>
    </ItemActions>
  </ItemRow>
);

// Classes section component
const ClassesSection = ({
  classes,
  onAddClass,
  onDeleteClass,
  onEditClass,
}: {
  classes: Record<string, ClassConfig>;
  onAddClass: () => void;
  onDeleteClass: (name: string) => void;
  onEditClass: (name: string) => void;
}) => {
  const classEntries = Object.entries(classes);

  return (
    <Section>
      <SectionHeader>
        <Typography fontWeight={500}>Classes</Typography>
        <AddButton onClick={onAddClass}>+ Add class</AddButton>
      </SectionHeader>
      {classEntries.length === 0 ? (
        <EmptyState>No classes yet</EmptyState>
      ) : (
        classEntries.map(([name, config]) => (
          <ClassRow
            key={name}
            name={name}
            attributeCount={Object.keys(config.attributes || {}).length}
            onDelete={() => onDeleteClass(name)}
            onEdit={() => onEditClass(name)}
          />
        ))
      )}
    </Section>
  );
};

// Attributes section component
const AttributesSection = ({
  attributes,
  onAddAttribute,
  onDeleteAttribute,
  onEditAttribute,
}: {
  attributes: Record<string, AttributeConfig>;
  onAddAttribute: () => void;
  onDeleteAttribute: (name: string) => void;
  onEditAttribute: (name: string) => void;
}) => {
  const attrEntries = Object.entries(attributes);

  return (
    <Section>
      <SectionHeader>
        <Typography fontWeight={500}>Attributes</Typography>
        <AddButton onClick={onAddAttribute}>+ Add attribute</AddButton>
      </SectionHeader>
      {attrEntries.length === 0 ? (
        <EmptyState>No attributes yet</EmptyState>
      ) : (
        attrEntries.map(([name, config]) => (
          <AttributeRow
            key={name}
            name={name}
            type={config.type}
            optionCount={config.options?.length}
            readOnly={config.readOnly}
            onDelete={() => onDeleteAttribute(name)}
            onEdit={() => onEditAttribute(name)}
          />
        ))
      )}
    </Section>
  );
};

// GUI View component
const GUIViewContent = ({
  config,
  scanning,
}: {
  config: SchemaConfigType | undefined;
  scanning: boolean;
}) => {
  const classes = config?.classes || {};
  const attributes = config?.attributes || {};

  if (scanning) {
    return (
      <ListContainer>
        <Section>
          <SectionHeader>
            <Typography fontWeight={500}>Classes</Typography>
          </SectionHeader>
          <EmptyState>
            <LoadingSpinner style={{ marginRight: 8 }} />
            Scanning schema
          </EmptyState>
        </Section>
        <Section>
          <SectionHeader>
            <Typography fontWeight={500}>Attributes</Typography>
          </SectionHeader>
          <EmptyState>
            <LoadingSpinner style={{ marginRight: 8 }} />
            Scanning schema
          </EmptyState>
        </Section>
      </ListContainer>
    );
  }

  return (
    <ListContainer>
      <ClassesSection
        classes={classes}
        onAddClass={() => {
          // TODO: Implement add class
        }}
        onDeleteClass={(name) => {
          // TODO: Implement delete class
        }}
        onEditClass={(name) => {
          // TODO: Implement edit class
        }}
      />
      <AttributesSection
        attributes={attributes}
        onAddAttribute={() => {
          // TODO: Implement add attribute
        }}
        onDeleteAttribute={(name) => {
          // TODO: Implement delete attribute
        }}
        onEditAttribute={(name) => {
          // TODO: Implement edit attribute
        }}
      />
    </ListContainer>
  );
};

// JSON View component
const JSONViewContent = ({
  configStr,
  onChange,
  path,
  scanning,
}: {
  configStr: string;
  onChange: (value: string) => void;
  path: string;
  scanning: boolean;
}) => {
  if (scanning) {
    return (
      <LoadingContainer>
        <LoadingSpinner />
        <Typography color="secondary">Scanning schema</Typography>
      </LoadingContainer>
    );
  }

  if (!configStr) {
    return null;
  }

  return (
    <CodeView
      data={configStr}
      onChange={(_, value) => onChange(value)}
      path={path}
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
    />
  );
};

// Main component
const EditAnnotationFieldSchema = ({ path }: { path: string }) => {
  const data = useAnnotationSchema(path);
  const setCurrentField = useSetAtom(currentField);
  const setNotification = useNotification();
  const fType = useAtomValue(fieldType(path));
  const activeFields = useAtomValue(activePaths);
  const hiddenFields = useAtomValue(inactivePaths);

  // All fields for the dropdown
  const allFields = useMemo(
    () => [...activeFields, ...hiddenFields].sort(),
    [activeFields, hiddenFields]
  );

  const [tab, setTab] = useState<"gui" | "json">("gui");
  const [readOnlyField, setReadOnlyField] = useState(false);

  useEffect(() => {
    if (data.savingComplete) {
      setCurrentField(null);
      setNotification({ msg: "Schema changes saved", variant: "success" });
    }
  }, [data.savingComplete, setCurrentField, setNotification]);

  return (
    <Container>
      {/* Field name and type section */}
      <FieldRow style={{ marginTop: "1rem" }}>
        <FieldColumn>
          <Label variant="body2">Field name</Label>
          <Select
            fullWidth
            size="small"
            value={path}
            onChange={(e) => setCurrentField(e.target.value as string)}
          >
            {allFields.map((field) => (
              <MenuItem key={field} value={field}>
                {field}
              </MenuItem>
            ))}
          </Select>
        </FieldColumn>
        <FieldColumn>
          <Label variant="body2">Field type</Label>
          <TextField
            fullWidth
            size="small"
            value={fType || ""}
            disabled
            InputProps={{ readOnly: true }}
          />
        </FieldColumn>
      </FieldRow>

      {/* Read-only toggle */}
      <Box my={2}>
        <Typography fontWeight={500}>Read-only</Typography>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="body2" color="secondary">
            When enabled, annotators can view this field but can't edit its
            values.
          </Typography>
          <Switch
            checked={readOnlyField}
            onChange={(e) => setReadOnlyField(e.target.checked)}
          />
        </Box>
      </Box>

      {/* Schema section */}
      <SchemaSection>
        <Label variant="body2">Schema</Label>
        <TabsRow>
          <Tabs
            value={tab}
            sx={tabsStyles}
            TabIndicatorProps={{ style: { display: "none" } }}
          >
            <Tab label="GUI" value="gui" onClick={() => setTab("gui")} />
            <Tab label="JSON" value="json" onClick={() => setTab("json")} />
          </Tabs>
          <ScanButton onClick={() => data.compute()}>
            <Sync fontSize="small" />
            Scan
          </ScanButton>
        </TabsRow>

        <ContentArea>
          {tab === "gui" ? (
            <GUIViewContent config={data.config} scanning={data.scanning} />
          ) : (
            <JSONViewContent
              configStr={data.configStr}
              onChange={data.setConfigStr}
              path={path}
              scanning={data.scanning}
            />
          )}
        </ContentArea>
      </SchemaSection>

      <Footer
        secondaryButton={{
          onClick: () => data.reset(),
          disabled: !data.hasChanges,
          text: "Discard",
        }}
        primaryButton={{
          onClick: () => data.save(),
          disabled: !data.hasChanges || data.saving,
          text: data.saving ? "Saving..." : "Save",
        }}
      />
    </Container>
  );
};

export default EditAnnotationFieldSchema;
