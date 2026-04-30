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
} from "@voxel51/voodo";
import { ATTRIBUTE_TYPE_LABELS, ATTRIBUTE_TYPE_OPTIONS } from "../../constants";
import { type AttributeFormData } from "../../utils";
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

    // Handlers
    handleNameChange,
    handleTypeChange,
    handleComponentChange,
    handleValuesChange,
    handleRangeChange,
    handleDefaultChange,
    handleListDefaultChange,
    handleReadOnlyChange,
  } = useAttributeForm({ formState, onFormStateChange });

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xl}>
      {/* Section 1: Identity cluster — name, type, ontology, read-only */}
      <Stack orientation={Orientation.Column} spacing={Spacing.None}>
        {/* Name field */}
        {isEditing ? (
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
              Name:
            </Text>
            <Text variant={TextVariant.Lg}>{formState.name}</Text>
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
            <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
              Type:
            </Text>
            <Text variant={TextVariant.Lg}>
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
            <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
              Ontology:
            </Text>
            <Text variant={TextVariant.Lg}>{formState._source}</Text>
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
              variant={TextVariant.Lg}
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
                variant={TextVariant.Lg}
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
                  variant={TextVariant.Lg}
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {whenPreview.suffix}
                </Text>
              )}
            </div>
          </Stack>
        )}

        {/* Read-only toggle */}
        <Stack orientation={Orientation.Column} spacing={Spacing.None}>
          <Stack
            orientation={Orientation.Row}
            spacing={Spacing.Sm}
            align={Align.Center}
          >
            <Text variant={TextVariant.Lg}>Read-only</Text>
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
      </Stack>

      {/* Section 2: Input type */}
      <FormField
        label="Input type"
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

      {/* Section 3: Values, range, and default — only rendered when at least one is visible */}
      {(showValues || showRange || supportsDefault) && (
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          {showValues && (
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
