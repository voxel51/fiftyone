/**
 * Attribute form content component for add/edit attribute.
 * Renders the form UI - logic is in useAttributeForm hook.
 */

import {
  Align,
  FormField,
  Input,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  ToggleSwitch,
} from "@voxel51/voodo";
import {
  ATTRIBUTE_TYPE_LABELS,
  ATTRIBUTE_TYPE_OPTIONS,
  BOOL_DEFAULT_OPTIONS,
} from "../../constants";
import { VALUES_MODE, type AttributeFormData } from "../../utils";
import OntologyPicker from "../OntologyPicker";
import { ONTOLOGY_TYPE, useOntologies } from "../useOntologies";
import ComponentTypeButton from "./ComponentTypeButton";
import ListDefaultInput from "./ListDefaultInput";
import RangeInput from "./RangeInput";
import useAttributeForm from "./useAttributeForm";
import ValuesList from "./ValuesList";

interface AttributeFormContentProps {
  formState: AttributeFormData;
  onFormStateChange: (state: AttributeFormData) => void;
  nameError: string | null;
  /** When true, name and type are rendered as read-only text */
  isEditing?: boolean;
}

const AttributeFormContent = ({
  formState,
  onFormStateChange,
  nameError,
  isEditing = false,
}: AttributeFormContentProps) => {
  const {
    // Derived state
    isNumericType,
    isIntegerType,
    isListType,
    isFromOntology,
    isTaxonomyEligible,
    whenPreview,
    supportsDefault,
    componentOptions,

    // Visibility flags
    showValues,
    showRange,

    // Validation errors
    valuesError,
    rangeError,
    defaultError,
    taxonomyError,

    // Handlers
    handleNameChange,
    handleTypeChange,
    handleComponentChange,
    handleValuesChange,
    handleRangeChange,
    handleDefaultChange,
    handleListDefaultChange,
    handleReadOnlyChange,
    handleValuesModeChange,
    handleTaxonomyChange,
  } = useAttributeForm({ formState, onFormStateChange });

  const {
    ontologies: taxonomies,
    isFetching: isFetchingTaxonomies,
    error: taxonomiesFetchError,
  } = useOntologies(ONTOLOGY_TYPE.taxonomy);

  const valuesModeTabs = [
    { id: VALUES_MODE.simple, data: { label: "Simple", content: null } },
    {
      id: VALUES_MODE.taxonomy,
      data: {
        label: "Taxonomy",
        content: null,
        disabled: !isTaxonomyEligible,
        tooltip: !isTaxonomyEligible
          ? "Taxonomies are only available on String or String List Dropdown inputs"
          : undefined,
      },
    },
  ];

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xl}>
      {/* Section 1: Identity cluster — name, type, ontology */}
      <Stack orientation={Orientation.Column} spacing={Spacing.None}>
        {/* Name field */}
        {isEditing ? (
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              Name:
            </Text>
            <Text variant={TextVariant.Md}>{formState.name}</Text>
          </Stack>
        ) : (
          <FormField
            label="Name"
            control={
              <Input
                value={formState.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Attribute name"
                error={!!nameError}
                autoFocus
              />
            }
            error={nameError ?? undefined}
          />
        )}

        {/* Attribute type dropdown */}
        {isEditing ? (
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              Type:
            </Text>
            <Text variant={TextVariant.Md}>
              {ATTRIBUTE_TYPE_LABELS[formState.type] || formState.type}
            </Text>
          </Stack>
        ) : (
          <FormField
            label="Attribute type"
            control={
              <Select
                exclusive
                portal
                value={formState.type}
                onChange={(value) => {
                  if (typeof value === "string") {
                    handleTypeChange(value);
                  }
                }}
                options={ATTRIBUTE_TYPE_OPTIONS}
              />
            }
          />
        )}

        {/* Ontology source (read-only, only shown when present) */}
        {isFromOntology && (
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              Ontology:
            </Text>
            <Text variant={TextVariant.Md}>{formState._source}</Text>
          </Stack>
        )}

        {/* Conditional visibility from ontology (read-only, only shown when present) */}
        {whenPreview && (
          <Stack
            orientation={Orientation.Row}
            spacing={Spacing.Sm}
            style={{ overflow: "hidden" }}
          >
            <Text
              variant={TextVariant.Md}
              color={TextColor.Secondary}
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              Appears when:
            </Text>
            <div
              style={{
                display: "flex",
                overflow: "hidden",
                minWidth: 0,
              }}
            >
              <Text
                variant={TextVariant.Md}
                style={{
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {whenPreview.condition}
              </Text>
              {whenPreview.suffix && (
                <Text
                  variant={TextVariant.Md}
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {whenPreview.suffix}
                </Text>
              )}
            </div>
          </Stack>
        )}
      </Stack>

      {/* Section 2: Read-only toggle */}
      <Stack orientation={Orientation.Column} spacing={Spacing.None}>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          align={Align.Center}
        >
          <Text variant={TextVariant.Md}>Read-only</Text>
          <Toggle
            checked={formState.read_only}
            onChange={handleReadOnlyChange}
            size={Size.Md}
            disabled={isFromOntology}
          />
        </Stack>
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          When enabled, annotators can view but cannot edit values.
        </Text>
      </Stack>

      {/* Section 3: Input type */}
      <FormField
        label="Input type"
        spacing={Spacing.Xs}
        control={
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            {componentOptions.map((opt) => (
              <ComponentTypeButton
                key={opt.id}
                icon={opt.icon}
                label={opt.label}
                isSelected={formState.component === opt.id}
                onClick={() => handleComponentChange(opt.id)}
                disabled={isFromOntology}
              />
            ))}
          </Stack>
        }
      />

      {/* Section 4: Values, range, and default — only rendered when at least one is visible */}
      {(showValues || showRange || supportsDefault) && (
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          {showValues && (
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              <ToggleSwitch
                key={formState.valuesMode}
                size={Size.Sm}
                defaultIndex={
                  formState.valuesMode === VALUES_MODE.taxonomy ? 1 : 0
                }
                onChange={(index) =>
                  handleValuesModeChange(
                    index === 0 ? VALUES_MODE.simple : VALUES_MODE.taxonomy
                  )
                }
                tabs={valuesModeTabs}
              />
              {formState.valuesMode === VALUES_MODE.simple ? (
                <ValuesList
                  values={formState.values}
                  onValuesChange={handleValuesChange}
                  isNumeric={isNumericType}
                  isInteger={isIntegerType}
                  error={valuesError}
                  readOnly={isFromOntology}
                  subtitle={
                    isFromOntology
                      ? "Showing a preview of values, additional values may exist in the ontology"
                      : undefined
                  }
                />
              ) : (
                <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                  <OntologyPicker
                    type={ONTOLOGY_TYPE.taxonomy}
                    ontologies={taxonomies}
                    isFetching={isFetchingTaxonomies}
                    error={taxonomiesFetchError}
                    onPick={handleTaxonomyChange}
                    value={formState.taxonomy}
                  />
                  {taxonomyError && (
                    <Text
                      variant={TextVariant.Sm}
                      color={TextColor.Destructive}
                    >
                      {taxonomyError}
                    </Text>
                  )}
                </Stack>
              )}
            </Stack>
          )}
          {showRange && (
            <RangeInput
              range={formState.range}
              onRangeChange={handleRangeChange}
              error={rangeError}
              readOnly={isFromOntology}
            />
          )}
          {supportsDefault && (
            <FormField
              label="Default (optional)"
              control={
                isListType ? (
                  <ListDefaultInput
                    values={formState.listDefault || []}
                    onChange={handleListDefaultChange}
                    choices={showValues ? formState.values : []}
                    isNumeric={isNumericType}
                    error={defaultError}
                    readOnly={isFromOntology}
                  />
                ) : formState.type === "bool" ? (
                  <Select
                    exclusive
                    portal
                    value={formState.default}
                    onChange={(value) => {
                      if (typeof value === "string") {
                        handleDefaultChange(value);
                      }
                    }}
                    options={BOOL_DEFAULT_OPTIONS}
                    disabled={isFromOntology}
                  />
                ) : (
                  <Input
                    type={isNumericType ? "number" : "text"}
                    value={formState.default}
                    onChange={(e) => handleDefaultChange(e.target.value)}
                    placeholder={
                      isNumericType ? "Default number" : "Default value"
                    }
                    error={!!defaultError}
                    disabled={isFromOntology}
                  />
                )
              }
              error={!isListType ? defaultError ?? undefined : undefined}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default AttributeFormContent;
