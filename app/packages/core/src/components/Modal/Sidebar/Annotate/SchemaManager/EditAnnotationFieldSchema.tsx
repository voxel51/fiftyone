import {
  CenteredStack,
  IconButton,
  LoadingSpinner,
} from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import {
  DeleteOutlined,
  DragIndicator,
  EditOutlined,
  Sync,
} from "@mui/icons-material";
import {
  Button,
  Input,
  Pill,
  Select,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  ToggleSwitch,
  Variant,
} from "@voxel51/voodo";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CodeView } from "../../../../../plugins/SchemaIO/components";
import { activePaths, fieldType, inactivePaths, schemaConfig } from "../state";
import Footer from "./Footer";
import { currentField } from "./state";
import {
  ContentArea,
  EditContainer,
  EditSectionHeader,
  EmptyStateBox,
  FieldColumn,
  FieldRow,
  ItemActions,
  ItemContent,
  ItemRow,
  ListContainer,
  SchemaSection,
  Section,
  TabsRow,
} from "./styled";

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
      <Text>{name}</Text>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        {attributeCount} attribute{attributeCount !== 1 ? "s" : ""}
      </Text>
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
      <Text>{name}</Text>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        {getAttributeTypeLabel(type)}
        {optionCount !== undefined &&
          ` · ${optionCount} option${optionCount !== 1 ? "s" : ""}`}
      </Text>
      {readOnly && <Pill size={Size.Sm}>Read-only</Pill>}
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
      <EditSectionHeader>
        <span className="font-medium">Classes</span>
        <Button size={Size.Sm} variant={Variant.Secondary} onClick={onAddClass}>
          + Add class
        </Button>
      </EditSectionHeader>
      {classEntries.length === 0 ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No classes yet</Text>
        </EmptyStateBox>
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
      <EditSectionHeader>
        <span className="font-medium">Attributes</span>
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          onClick={onAddAttribute}
        >
          + Add attribute
        </Button>
      </EditSectionHeader>
      {attrEntries.length === 0 ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No attributes yet</Text>
        </EmptyStateBox>
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
          <EditSectionHeader>
            <span className="font-medium">Classes</span>
          </EditSectionHeader>
          <EmptyStateBox>
            <LoadingSpinner style={{ marginRight: 8 }} />
            <Text color={TextColor.Secondary}>Scanning schema</Text>
          </EmptyStateBox>
        </Section>
        <Section>
          <EditSectionHeader>
            <span className="font-medium">Attributes</span>
          </EditSectionHeader>
          <EmptyStateBox>
            <LoadingSpinner style={{ marginRight: 8 }} />
            <Text color={TextColor.Secondary}>Scanning schema</Text>
          </EmptyStateBox>
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
      <CenteredStack spacing={1} sx={{ p: 3 }}>
        <LoadingSpinner />
        <Text color={TextColor.Secondary}>Scanning schema</Text>
      </CenteredStack>
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

  const [readOnlyField, setReadOnlyField] = useState(false);

  useEffect(() => {
    if (data.savingComplete) {
      setCurrentField(null);
      setNotification({ msg: "Schema changes saved", variant: "success" });
    }
  }, [data.savingComplete, setCurrentField, setNotification]);

  return (
    <EditContainer>
      {/* Field name and type section */}
      <FieldRow style={{ marginTop: "1rem" }}>
        <FieldColumn>
          <Text
            variant={TextVariant.Xl}
            color={TextColor.Secondary}
            className="mb-2 block"
          >
            Field name
          </Text>
          <Select
            exclusive
            value={path}
            onChange={(value) => {
              if (typeof value === "string") {
                setCurrentField(value);
              }
            }}
            options={allFields.map((field) => ({
              id: field,
              data: { label: field },
            }))}
          />
        </FieldColumn>
        <FieldColumn>
          <Text
            variant={TextVariant.Xl}
            color={TextColor.Secondary}
            className="mb-2 block"
          >
            Field type
          </Text>
          <Input value={fType || ""} disabled readOnly />
        </FieldColumn>
      </FieldRow>

      {/* Read-only toggle */}
      <div className="my-4">
        <div className="flex items-center justify-between mb-1">
          <Text variant={TextVariant.Xl}>Read-only</Text>
          <Toggle
            size={Size.Sm}
            checked={readOnlyField}
            onChange={(checked) => setReadOnlyField(checked)}
          />
        </div>
        <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
          When enabled, annotators can view this field but can't edit its
          values.
        </Text>
      </div>

      {/* Schema section */}
      <SchemaSection>
        <TabsRow>
          <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
            Schema
          </Text>
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={() => data.compute()}
          >
            <Sync fontSize="small" style={{ marginRight: 4 }} />
            Scan
          </Button>
        </TabsRow>
        <ToggleSwitch
          size={Size.Sm}
          tabs={[
            {
              id: "gui",
              data: {
                label: "GUI",
                content: (
                  <ContentArea>
                    <GUIViewContent
                      config={data.config}
                      scanning={data.scanning}
                    />
                  </ContentArea>
                ),
              },
            },
            {
              id: "json",
              data: {
                label: "JSON",
                content: (
                  <ContentArea>
                    <JSONViewContent
                      configStr={data.configStr}
                      onChange={data.setConfigStr}
                      path={path}
                      scanning={data.scanning}
                    />
                  </ContentArea>
                ),
              },
            },
          ]}
        />
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
    </EditContainer>
  );
};

export default EditAnnotationFieldSchema;
