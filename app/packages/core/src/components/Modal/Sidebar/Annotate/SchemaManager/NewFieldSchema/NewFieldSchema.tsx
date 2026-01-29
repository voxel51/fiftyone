/**
 * NewFieldSchema Component
 *
 * Single-step flow for creating new fields with full schema configuration.
 * - Label fields: configure classes and attributes
 * - Primitive fields: configure component type, values, range
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import {
  Input,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  ToggleSwitch,
} from "@voxel51/voodo";
import { useCallback, useMemo, useState } from "react";
import {
  ATTRIBUTE_TYPE_OPTIONS,
  LABEL_TYPE_OPTIONS,
  getDefaultComponent,
} from "../constants";
import {
  useExitNewFieldMode,
  useLabelSchemasData,
  useSetActiveLabelSchemas,
  useSetLabelSchemasData,
} from "../hooks";
import AttributesSection from "../EditFieldLabelSchema/GUIContent/AttributesSection";
import ClassesSection from "../EditFieldLabelSchema/GUIContent/ClassesSection";
import PrimitiveFieldContent from "../EditFieldLabelSchema/GUIContent/PrimitiveFieldContent";
import Footer from "../Footer";
import { ListContainer } from "../styled";
import type { AttributeConfig, SchemaConfigType } from "../utils";

type FieldCategory = "label" | "primitive";

const CATEGORY_LABEL = 0;
const CATEGORY_PRIMITIVE = 1;

// Base attributes shared by all label types (_HasID mixin + confidence)
const BASE_LABEL_ATTRIBUTES: AttributeConfig[] = [
  { name: "id", type: "id", component: "text", read_only: true },
  { name: "tags", type: "list<str>", component: "text" },
  { name: "confidence", type: "float", component: "text" },
];

// Detection also has 'index' field
const DEFAULT_DETECTION_ATTRIBUTES: AttributeConfig[] = [
  ...BASE_LABEL_ATTRIBUTES,
  { name: "index", type: "int", component: "text" },
];

// Classification uses base attributes only
const DEFAULT_CLASSIFICATION_ATTRIBUTES: AttributeConfig[] =
  BASE_LABEL_ATTRIBUTES;

// Convert schema type to field type format (e.g., "str" -> "Str")
const toFieldType = (schemaType: string): string => {
  if (schemaType.startsWith("list<")) {
    return "List<" + schemaType.slice(5);
  }
  return schemaType.charAt(0).toUpperCase() + schemaType.slice(1);
};

const NewFieldSchema = () => {
  const [fieldName, setFieldName] = useState("");
  const [category, setCategory] = useState<FieldCategory>("label");
  const [labelType, setLabelType] = useState("detections");
  const [primitiveType, setPrimitiveType] = useState("str");
  const [primitiveConfig, setPrimitiveConfig] = useState<SchemaConfigType>({
    type: "str",
    component: getDefaultComponent("str"),
  });
  const [isCreating, setIsCreating] = useState(false);

  // Label schema state
  const [classes, setClasses] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<AttributeConfig[]>(
    DEFAULT_DETECTION_ATTRIBUTES
  );
  const [newAttributes, setNewAttributes] = useState<Set<string>>(new Set());

  const createField = useOperatorExecutor("create_and_activate_field");
  const getSchemas = useOperatorExecutor("get_label_schemas");
  const setLabelSchemasData = useSetLabelSchemasData();
  const setActiveLabelSchemas = useSetActiveLabelSchemas();
  const exitNewFieldMode = useExitNewFieldMode();
  const schemasData = useLabelSchemasData();

  // Validate field name
  const fieldNameError = useMemo(() => {
    const trimmed = fieldName.trim();
    if (!trimmed) return null;
    if (schemasData && trimmed in schemasData) {
      return "Field name already exists";
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
      return "Invalid field name (use letters, numbers, underscores)";
    }
    return null;
  }, [fieldName, schemasData]);

  const canCreate = fieldName.trim() !== "" && !fieldNameError && !isCreating;

  const handleCategoryChange = useCallback((index: number) => {
    setCategory(index === CATEGORY_LABEL ? "label" : "primitive");
  }, []);

  const handleLabelTypeChange = useCallback((newType: string) => {
    setLabelType(newType);
    // Reset attributes to defaults for the new type
    setAttributes(
      newType === "detections"
        ? DEFAULT_DETECTION_ATTRIBUTES
        : DEFAULT_CLASSIFICATION_ATTRIBUTES
    );
    setNewAttributes(new Set());
    setClasses([]);
  }, []);

  const handlePrimitiveTypeChange = useCallback((newType: string) => {
    setPrimitiveType(newType);
    setPrimitiveConfig({
      type: newType,
      component: getDefaultComponent(newType),
    });
  }, []);

  const handlePrimitiveConfigChange = useCallback(
    (config: SchemaConfigType) => {
      setPrimitiveConfig(config);
    },
    []
  );

  // Class handlers
  const handleAddClass = useCallback((name: string) => {
    setClasses((prev) => [name, ...prev]);
  }, []);

  const handleEditClass = useCallback((oldName: string, newName: string) => {
    setClasses((prev) => prev.map((c) => (c === oldName ? newName : c)));
  }, []);

  const handleDeleteClass = useCallback((name: string) => {
    setClasses((prev) => prev.filter((c) => c !== name));
  }, []);

  const handleClassOrderChange = useCallback((newOrder: string[]) => {
    setClasses(newOrder);
  }, []);

  // Attribute handlers
  const handleAddAttribute = useCallback((config: AttributeConfig) => {
    setAttributes((prev) => [config, ...prev]);
    setNewAttributes((prev) => new Set(prev).add(config.name));
  }, []);

  const handleEditAttribute = useCallback(
    (oldName: string, config: AttributeConfig) => {
      setAttributes((prev) =>
        prev.map((attr) => (attr.name === oldName ? config : attr))
      );
      // Track renamed new attributes
      if (newAttributes.has(oldName)) {
        setNewAttributes((prev) => {
          const updated = new Set(prev);
          updated.delete(oldName);
          updated.add(config.name);
          return updated;
        });
      }
    },
    [newAttributes]
  );

  const handleDeleteAttribute = useCallback(
    (name: string) => {
      setAttributes((prev) => prev.filter((attr) => attr.name !== name));
      if (newAttributes.has(name)) {
        setNewAttributes((prev) => {
          const updated = new Set(prev);
          updated.delete(name);
          return updated;
        });
      }
    },
    [newAttributes]
  );

  const handleAttributeOrderChange = useCallback(
    (newOrder: AttributeConfig[]) => {
      setAttributes(newOrder);
    },
    []
  );

  const handleCreate = useCallback(() => {
    if (!canCreate) return;

    setIsCreating(true);
    const trimmedName = fieldName.trim();

    // Build params
    const params: Record<string, unknown> = {
      field_name: trimmedName,
      field_category: category,
      field_type: category === "label" ? labelType : primitiveType,
      read_only: false,
    };

    if (category === "primitive" && primitiveConfig) {
      params.schema_config = primitiveConfig;
    } else if (category === "label") {
      // Build new_attributes array for data schema creation
      const newAttrsArr = attributes.filter((attr) =>
        newAttributes.has(attr.name)
      );

      params.label_schema_config = {
        classes,
        attributes,
        new_attributes: newAttrsArr.length > 0 ? newAttrsArr : undefined,
      };
    }

    createField.execute(params, {
      callback: (createResult) => {
        if (createResult.error) {
          setIsCreating(false);
          console.error("Failed to create field:", createResult.error);
          return;
        }

        // Refresh schemas data
        getSchemas.execute(
          {},
          {
            callback: (schemasResult) => {
              setIsCreating(false);

              if (schemasResult.result) {
                setLabelSchemasData(schemasResult.result.label_schemas);
                setActiveLabelSchemas(
                  schemasResult.result.active_label_schemas
                );
              }

              // Go back to schema manager (both label and primitive are fully configured)
              exitNewFieldMode();
            },
          }
        );
      },
    });
  }, [
    canCreate,
    fieldName,
    category,
    labelType,
    primitiveType,
    primitiveConfig,
    classes,
    attributes,
    newAttributes,
    createField,
    getSchemas,
    setLabelSchemasData,
    setActiveLabelSchemas,
    exitNewFieldMode,
  ]);

  const handleDiscard = useCallback(() => {
    exitNewFieldMode();
  }, [exitNewFieldMode]);

  return (
    <ListContainer style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "1rem" }}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Lg}
          style={{ width: "100%" }}
        >
          {/* Field name input */}
          <div>
            <Text
              variant={TextVariant.Md}
              color={TextColor.Secondary}
              style={{ marginBottom: "0.5rem" }}
            >
              Field name
            </Text>
            <Input
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="Enter field name"
              error={!!fieldNameError}
              autoFocus
            />
            {fieldNameError && (
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Destructive}
                style={{ marginTop: 4 }}
              >
                {fieldNameError}
              </Text>
            )}
          </div>

          {/* Category toggle */}
          <div style={{ width: "100%" }}>
            <Text
              variant={TextVariant.Md}
              color={TextColor.Secondary}
              style={{ marginBottom: "0.5rem" }}
            >
              Field category
            </Text>
            <ToggleSwitch
              size={Size.Md}
              defaultIndex={CATEGORY_LABEL}
              onChange={handleCategoryChange}
              fullWidth
              tabs={[
                { id: "label", data: { label: "Label" } },
                { id: "primitive", data: { label: "Primitive" } },
              ]}
            />
          </div>

          {/* Type dropdown */}
          <div>
            <Text
              variant={TextVariant.Md}
              color={TextColor.Secondary}
              style={{ marginBottom: "0.5rem" }}
            >
              {category === "label" ? "Label type" : "Primitive type"}
            </Text>
            <Select
              exclusive
              portal
              value={category === "label" ? labelType : primitiveType}
              onChange={(value) => {
                if (typeof value === "string") {
                  if (category === "label") {
                    handleLabelTypeChange(value);
                  } else {
                    handlePrimitiveTypeChange(value);
                  }
                }
              }}
              options={
                category === "label"
                  ? LABEL_TYPE_OPTIONS
                  : ATTRIBUTE_TYPE_OPTIONS
              }
            />
          </div>

          {/* Primitive field config */}
          {category === "primitive" && (
            <PrimitiveFieldContent
              fieldType={toFieldType(primitiveType)}
              config={primitiveConfig}
              onConfigChange={handlePrimitiveConfigChange}
            />
          )}

          {/* Label field config: Classes and Attributes */}
          {category === "label" && (
            <>
              <ClassesSection
                classes={classes}
                attributeCount={attributes.length}
                onAddClass={handleAddClass}
                onEditClass={handleEditClass}
                onDeleteClass={handleDeleteClass}
                onOrderChange={handleClassOrderChange}
              />
              <AttributesSection
                attributes={attributes}
                onAddAttribute={handleAddAttribute}
                onEditAttribute={handleEditAttribute}
                onDeleteAttribute={handleDeleteAttribute}
                onOrderChange={handleAttributeOrderChange}
              />
            </>
          )}
        </Stack>
      </div>

      <Footer
        secondaryButton={{
          onClick: handleDiscard,
          text: "Discard",
        }}
        primaryButton={{
          onClick: handleCreate,
          disabled: !canCreate,
          text: isCreating ? "Creating..." : "Create",
        }}
      />
    </ListContainer>
  );
};

export default NewFieldSchema;
