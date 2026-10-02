/**
 * NewFieldSchema Component
 *
 * Single-step flow for creating new fields with full schema configuration.
 * - Label fields: configure classes and attributes
 * - Primitive fields: configure component type, values, range
 */

import { scrollable } from "@fiftyone/components";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useNotification, useRefresh } from "@fiftyone/state";
import { is3d } from "@fiftyone/utilities";
import {
  FormField,
  Input,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  ToggleSwitch,
  Anchor,
  Pill,
  Text,
  Tooltip,
} from "@voxel51/voodo";

import {
  useActiveFieldsList,
  useAddToExploreActiveFields,
  useExitNewFieldMode,
  useLabelSchemasData,
  useMediaType,
  useSetLabelSchemasData,
} from "../hooks";

import {
  useSchemaManager,
  type LabelSchemaConfig,
} from "../../useSchemaManager";

import AttributesSection from "../EditFieldLabelSchema/GUIContent/AttributesSection";
import ClassesSection from "../EditFieldLabelSchema/GUIContent/ClassesSection";
import PrimitiveFieldContent from "../EditFieldLabelSchema/GUIContent/PrimitiveFieldContent";
import Footer from "../Footer";
import { ListContainer } from "../styled";
import {
  defaultClassesComponent,
  getLabelTypeOptions,
  supportsDynamicAttributes,
  validateFieldName,
  isFrameLevelLabelType,
  type NewFieldScope,
} from "../utils";

import {
  type ClassesComponent,
  ATTRIBUTE_TYPE_OPTIONS,
  CATEGORY_LABEL,
  DEFAULT_DETECTION_ATTRIBUTES_2D,
  getDefaultAttributesForType,
  getDefaultComponent,
  toFieldType,
  FRAME_PREFIX_TOOLTIP,
} from "../constants";

import type { AttributeConfig, SchemaConfigType } from "../utils";
import { useAtomValue, useSetAtom } from "jotai";
import {
  loadedSchemaDoc,
  selectedSchemaDocId,
  useSchemaDocs,
  type SchemaDocContentEntry,
} from "../useSchemaDocs";

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
    DEFAULT_DETECTION_ATTRIBUTES_2D,
  );
  const [newAttributes, setNewAttributes] = useState<Set<string>>(new Set());
  // Explicit Radio/Dropdown choice for the classes; undefined = class-count
  // default, which is what the control shows until the user picks one
  const [classesComponentChoice, setClassesComponentChoice] = useState<
    ClassesComponent | undefined
  >(undefined);
  const classesComponent =
    classesComponentChoice ?? defaultClassesComponent(classes);

  const { createAndActivateField, listSchemas } = useSchemaManager();
  const schemaDocs = useSchemaDocs();
  // The schema this field is being created in (null = dataset default).
  const selectedDocId = useAtomValue(selectedSchemaDocId);
  const setLoadedDoc = useSetAtom(loadedSchemaDoc);
  const setLabelSchemasData = useSetLabelSchemasData();
  const { setFields: setActiveFields } = useActiveFieldsList();
  const exitNewFieldMode = useExitNewFieldMode();
  const schemasData = useLabelSchemasData();
  const currentMediaType = useMediaType();
  const is3dMedia = !!(currentMediaType && is3d(currentMediaType));

  const addToExploreActiveFields = useAddToExploreActiveFields();
  const notify = useNotification();
  const refreshSchema = useRefresh();

  // Initialize correct attributes for 3D media
  useEffect(() => {
    if (is3dMedia) {
      setAttributes(getDefaultAttributesForType(labelType, true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is3dMedia]);

  const labelTypeOptions = useMemo(
    () => getLabelTypeOptions(currentMediaType),
    [currentMediaType],
  );

  // On video, a LABEL field's scope follows its type: spatial labels are
  // frame fields and the form adds the "frames." prefix (shown as a pill
  // in the name input); classification / temporal detections are
  // sample-level. Primitives keep the typed name (a hand-typed "frames."
  // prefix is still how a frame-level primitive is made).
  const isVideo = currentMediaType === "video";
  const scope: NewFieldScope | undefined =
    isVideo && category === "label"
      ? isFrameLevelLabelType(labelType)
        ? "frame"
        : "sample"
      : undefined;
  const frameScoped = scope === "frame";
  const typedName = fieldName.trim();
  const effectiveName =
    frameScoped && !typedName.startsWith("frames.")
      ? `frames.${typedName}`
      : typedName;

  // Validate field name
  const fieldNameError = useMemo(
    () => validateFieldName(fieldName, schemasData, currentMediaType, scope),
    [fieldName, schemasData, currentMediaType, scope],
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
      setClassesComponentChoice(undefined);
    },
    [is3dMedia],
  );

  // Keep the selected label type within the options available for the current
  // field scope — e.g. switching to a "frames." field drops the clip-level
  // types, so a stale selection must fall back to a valid one.
  useEffect(() => {
    const ids = labelTypeOptions.map((option) => option.id);
    if (category === "label" && !ids.includes(labelType)) {
      handleLabelTypeChange(labelTypeOptions[0].id);
    }
  }, [category, labelType, labelTypeOptions, handleLabelTypeChange]);

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
    [],
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
        prev.map((attr) => (attr.name === oldName ? config : attr)),
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
    [newAttributes],
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
    [newAttributes],
  );

  const handleAttributeOrderChange = useCallback(
    (newOrder: AttributeConfig[]) => {
      setAttributes(newOrder);
    },
    [],
  );

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;

    setIsCreating(true);
    const trimmedName = effectiveName;

    // Build label schema config for label fields
    let label_schema_config: LabelSchemaConfig | undefined;
    if (category === "label") {
      const newAttrsArr = attributes.filter((attr) =>
        newAttributes.has(attr.name),
      );
      label_schema_config = {
        classes,
        attributes,
        new_attributes: newAttrsArr.length > 0 ? newAttrsArr : undefined,
        // Send what the form shows. With no classes the control is hidden
        // and the operator applies its own default.
        component: classes.length > 0 ? classesComponent : undefined,
      };
    }

    try {
      await createAndActivateField({
        field_name: trimmedName,
        field_category: category,
        field_type: category === "label" ? labelType : primitiveType,
        read_only: false,
        label_schema_config,
        schema_config:
          category === "primitive" && primitiveConfig
            ? primitiveConfig
            : undefined,
      });

      // Visibility across schemas: the creation itself made the field
      // active and annotatable in the dataset default; the schema it
      // was created in gets it as annotate-tier content; every other
      // custom schema gets it hidden.
      try {
        const contentEntry =
          category === "label"
            ? ({
                type: labelType,
                classes,
                attributes,
              } as SchemaDocContentEntry)
            : ({
                ...(primitiveConfig ?? {}),
                type: primitiveType,
              } as unknown as SchemaDocContentEntry);
        await schemaDocs.propagateField(
          trimmedName,
          contentEntry,
          selectedDocId ?? null,
        );
        if (selectedDocId) {
          setLoadedDoc(await schemaDocs.getDoc(selectedDocId));
        }
      } catch (err) {
        console.error("Failed to propagate the new field to schemas:", err);
        notify({
          msg: "Field created, but adding it to some schemas failed",
          variant: "error",
        });
      }

      const { active_label_schemas, label_schemas } = await listSchemas({});

      setLabelSchemasData(label_schemas);
      setActiveFields(active_label_schemas);

      // Add the new field to exploreActiveFields so it's
      // immediately visible (visibleLabelSchemas intersects
      // activeLabelSchemas with exploreActiveFields).
      addToExploreActiveFields(trimmedName);

      refreshSchema();
      exitNewFieldMode();
    } catch (error) {
      console.error("Failed to create field:", error);
      notify({
        msg: `Failed to create field: ${
          error instanceof Error ? error.message : String(error)
        }`,
        variant: "error",
      });
    } finally {
      setIsCreating(false);
    }
  }, [
    addToExploreActiveFields,
    attributes,
    canCreate,
    category,
    classes,
    classesComponent,
    createAndActivateField,
    schemaDocs,
    selectedDocId,
    setLoadedDoc,
    exitNewFieldMode,
    effectiveName,
    labelType,
    listSchemas,
    newAttributes,
    notify,
    primitiveConfig,
    primitiveType,
    refreshSchema,
    setActiveFields,
    setLabelSchemasData,
  ]);

  const handleDiscard = useCallback(() => {
    exitNewFieldMode();
  }, [exitNewFieldMode]);

  return (
    <ListContainer style={{ display: "flex", flexDirection: "column" }}>
      <div
        className={scrollable}
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: "1rem",
          paddingRight: "1rem",
        }}
      >
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Lg}
          style={{ width: "100%" }}
        >
          {/* Field name input */}
          <FormField
            label="Field name"
            control={
              <div style={{ position: "relative", width: "100%" }}>
                {frameScoped ? (
                  <Tooltip
                    anchor={Anchor.Bottom}
                    portal
                    content={<Text>{FRAME_PREFIX_TOOLTIP}</Text>}
                    style={{
                      position: "absolute",
                      left: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      zIndex: 1,
                    }}
                  >
                    <Pill size={Size.Sm} data-cy="frames-prefix-pill">
                      frames.
                    </Pill>
                  </Tooltip>
                ) : null}
                <Input
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder={
                    isVideo && category === "primitive"
                      ? "Enter field name (e.g. frames.confidence)"
                      : "Enter field name"
                  }
                  error={!!fieldNameError}
                  autoFocus
                  data-cy="new-field-name"
                  style={{
                    width: "100%",
                    paddingLeft: frameScoped ? 76 : undefined,
                  }}
                />
              </div>
            }
            error={fieldNameError || undefined}
          />

          {/* Category toggle */}
          <FormField
            label="Field category"
            control={
              <ToggleSwitch
                size={Size.Md}
                defaultIndex={CATEGORY_LABEL}
                onChange={handleCategoryChange}
                fullWidth
                tabs={[
                  { id: "label", data: { label: "Label", content: null } },
                  {
                    id: "primitive",
                    data: { label: "Primitive", content: null },
                  },
                ]}
              />
            }
          />

          {/* Type dropdown */}
          <FormField
            label={category === "label" ? "Label type" : "Primitive type"}
            control={
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
                    ? labelTypeOptions
                    : ATTRIBUTE_TYPE_OPTIONS
                }
              />
            }
          />

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
                component={classesComponent}
                onAddClass={handleAddClass}
                onEditClass={handleEditClass}
                onDeleteClass={handleDeleteClass}
                onComponentChange={setClassesComponentChoice}
                onOrderChange={handleClassOrderChange}
              />
              <AttributesSection
                attributes={attributes}
                canAddAttributes={supportsDynamicAttributes(
                  currentMediaType,
                  effectiveName || "new",
                  labelType,
                )}
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
