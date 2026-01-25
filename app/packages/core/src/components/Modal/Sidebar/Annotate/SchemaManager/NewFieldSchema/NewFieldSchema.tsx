/**
 * NewFieldSchema Component
 *
 * Step 1 of creating a new field - collects field info and creates the field.
 * After creation, transitions to EditFieldLabelSchema.
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
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import {
  activeLabelSchemas,
  currentField,
  labelSchemasData,
} from "../../state";
import {
  ATTRIBUTE_TYPE_OPTIONS,
  LABEL_TYPE_OPTIONS,
  getDefaultComponent,
} from "../constants";
import PrimitiveFieldContent from "../EditFieldLabelSchema/GUIContent/PrimitiveFieldContent";
import Footer from "../Footer";
import { EditContainer } from "../styled";
import { isNewFieldMode } from "../state";
import type { SchemaConfigType } from "../utils";

type FieldCategory = "label" | "primitive";

const CATEGORY_LABEL = 0;
const CATEGORY_PRIMITIVE = 1;

// Convert schema type to field type format (e.g., "str" -> "Str")
const toFieldType = (schemaType: string): string => {
  if (schemaType.startsWith("list<")) {
    // "list<str>" -> "List<str>"
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

  const createField = useOperatorExecutor("create_and_activate_field");
  const getSchemas = useOperatorExecutor("get_label_schemas");
  const setLabelSchemasData = useSetAtom(labelSchemasData);
  const setActiveLabelSchemas = useSetAtom(activeLabelSchemas);
  const setCurrentField = useSetAtom(currentField);
  const setNewFieldMode = useSetAtom(isNewFieldMode);
  const schemasData = useAtomValue(labelSchemasData);

  // Validate field name
  const fieldNameError = useMemo(() => {
    const trimmed = fieldName.trim();
    if (!trimmed) return null; // Don't show error for empty (user hasn't typed yet)
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

  const handlePrimitiveTypeChange = useCallback((newType: string) => {
    setPrimitiveType(newType);
    // Reset config when type changes
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

    // For primitives, include the schema config (component, values, range)
    if (category === "primitive" && primitiveConfig) {
      params.schema_config = primitiveConfig;
    }

    createField.execute(params, {
      callback: (createResult) => {
        if (createResult.error) {
          setIsCreating(false);
          console.error("Failed to create field:", createResult.error);
          return;
        }

        // Refresh schemas data and wait for completion before navigating
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

              // Navigate based on field category
              setNewFieldMode(false);
              if (category === "label") {
                // Label fields go to edit view to configure classes/attributes
                setCurrentField(trimmedName);
              }
              // Primitive fields stay on schema manager (already configured)
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
    createField,
    getSchemas,
    setLabelSchemasData,
    setActiveLabelSchemas,
    setNewFieldMode,
    setCurrentField,
  ]);

  const handleDiscard = useCallback(() => {
    setNewFieldMode(false);
  }, [setNewFieldMode]);

  return (
    <EditContainer>
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
                    setLabelType(value);
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

          {/* Primitive field config (component type, values, range) */}
          {category === "primitive" && (
            <PrimitiveFieldContent
              fieldType={toFieldType(primitiveType)}
              config={primitiveConfig}
              onConfigChange={handlePrimitiveConfigChange}
            />
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
    </EditContainer>
  );
};

export default NewFieldSchema;
