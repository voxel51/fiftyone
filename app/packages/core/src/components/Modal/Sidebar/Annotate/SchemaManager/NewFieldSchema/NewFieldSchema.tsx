/**
 * NewFieldSchema Component
 *
 * Single-step flow for creating new fields with full schema configuration.
 * - Label fields: configure classes and attributes
 * - Primitive fields: configure component type, values, range
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSetAtom } from "jotai";

import { useOperatorExecutor } from "@fiftyone/operators";
import { is3d } from "@fiftyone/utilities";
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

import { addToActiveSchemas } from "../../state";

import {
  useExitNewFieldMode,
  useLabelSchemasData,
  useMediaType,
  useSetActiveLabelSchemas,
  useSetLabelSchemasData,
} from "../hooks";

import AttributesSection from "../EditFieldLabelSchema/GUIContent/AttributesSection";
import ClassesSection from "../EditFieldLabelSchema/GUIContent/ClassesSection";
import PrimitiveFieldContent from "../EditFieldLabelSchema/GUIContent/PrimitiveFieldContent";
import Footer from "../Footer";
import { ListContainer } from "../styled";
import { getLabelTypeOptions, validateFieldName } from "../utils";

import {
  ATTRIBUTE_TYPE_OPTIONS,
  CATEGORY_LABEL,
  DEFAULT_DETECTION_ATTRIBUTES_2D,
  getDefaultAttributesForType,
  getDefaultComponent,
  toFieldType,
} from "../constants";

import type { AttributeConfig, SchemaConfigType } from "../utils";

type FieldCategory = "label" | "primitive";

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
    DEFAULT_DETECTION_ATTRIBUTES_2D
  );
  const [newAttributes, setNewAttributes] = useState<Set<string>>(new Set());

  const createField = useOperatorExecutor("create_and_activate_field");
  const getSchemas = useOperatorExecutor("get_label_schemas");
  const setLabelSchemasData = useSetLabelSchemasData();
  const setActiveLabelSchemas = useSetActiveLabelSchemas();
  const exitNewFieldMode = useExitNewFieldMode();
  const schemasData = useLabelSchemasData();
  const currentMediaType = useMediaType();
  const is3dMedia = !!(currentMediaType && is3d(currentMediaType));

  const addToActiveSchema = useSetAtom(addToActiveSchemas);
  const activateFields = useOperatorExecutor("activate_label_schemas");

  // Initialize correct attributes for 3D media
  useEffect(() => {
    if (is3dMedia) {
      setAttributes(getDefaultAttributesForType(labelType, true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is3dMedia]);

  // Get label type options based on media type
  const labelTypeOptions = useMemo(
    () => getLabelTypeOptions(currentMediaType),
    [currentMediaType]
  );

  // Validate field name
  const fieldNameError = useMemo(
    () => validateFieldName(fieldName, schemasData),
    [fieldName, schemasData]
  );

  const canCreate = fieldName.trim() !== "" && !fieldNameError && !isCreating;

  const handleCategoryChange = useCallback((index: number) => {
    setCategory(index === CATEGORY_LABEL ? "label" : "primitive");
  }, []);

  const handleLabelTypeChange = useCallback(
    (newType: string) => {
      setLabelType(newType);
      setAttributes(getDefaultAttributesForType(newType, is3dMedia));
      setNewAttributes(new Set());
      setClasses([]);
    },
    [is3dMedia]
  );

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
          return;
        }

        // Refresh schemas data
        getSchemas.execute(
          {},
          {
            callback: (schemasResult) => {
              setIsCreating(false);

              if (schemasResult.result) {
                const {
                  active_label_schemas,
                  label_schemas,
                } = schemasResult.result;

                addToActiveSchema(active_label_schemas);
                activateFields.execute({
                  fields: active_label_schemas,
                });
                setLabelSchemasData(label_schemas);
                setActiveLabelSchemas(active_label_schemas);
              }

              // Go back to schema manager (both label and primitive are fully configured)
              exitNewFieldMode();
            },
          }
        );
      },
    });
  }, [
    attributes,
    activateFields,
    canCreate,
    category,
    classes,
    createField,
    exitNewFieldMode,
    fieldName,
    getSchemas,
    labelType,
    newAttributes,
    primitiveConfig,
    primitiveType,
    setActiveLabelSchemas,
    setLabelSchemasData,
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
                style={{ marginTop: "0.2rem" }}
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
                category === "label" ? labelTypeOptions : ATTRIBUTE_TYPE_OPTIONS
              }
            />
          </div>

          {/* Primitive field config */}
          {category === "primitive" && (
            <PrimitiveFieldContent
              field={fieldName || "new_field"}
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
