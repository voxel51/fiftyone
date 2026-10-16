/**
 * Attributes section of the field editor.
 *
 * In a custom schema it mirrors the Schema Manager's two sections:
 *
 * - **Active** — attributes annotators see (draggable: the order drives
 *   the annotation form), led by the field's "shape" and "label" access
 *   rows. Whether an attribute is read-only is a toggle inside its
 *   expanded card (and inline on the access rows).
 * - **Hidden** — attributes this schema removes entirely, for anyone
 *   viewing through it.
 *
 * Rows carry checkboxes; the editor footer moves the selection between
 * the sections (see `AttributeMoveAction`), and the move persists with
 * Save. The dataset default cannot hide: its rows carry no checkboxes
 * and its Hidden section explains where hiding lives. Every row keeps
 * its pencil on the right for editing the attribute.
 */

import {
  Align,
  Button,
  Orientation,
  Pill,
  RichList,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Variant,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { useAtom, useAtomValue } from "jotai";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldSchema } from "../../../useSchemaManager";
import {
  pendingAttributeTiers,
  selectedActiveAttributes,
  selectedHiddenAttributes,
} from "../../state";
import {
  EditSectionHeader,
  EmptyStateBox,
  Section,
  SelectableList,
} from "../../styled";
import {
  docAttributeHidden,
  PROTECTED_ATTRIBUTES,
  useManagerDocMode,
} from "../../useSchemaDocs";
import {
  getAttributeFormErrors,
  getAttributeNameError,
  getAttributeTypeLabel,
  hasAttributeFormError,
  toAttributeConfig,
  toFormData,
  type AttributeConfig,
  type AttributeFormData,
} from "../../utils";
import {
  accessKnobsFor,
  KNOB_LABELS,
  knobIsReadOnly,
  type AccessKnob,
} from "../FieldAccess";
import AddAttributeCard from "./AddAttributeCard";
import { createAttributeCardItem } from "./AttributeCard";
import EditAction from "./EditAction";
import SelectAllCheckbox from "../../SelectAllCheckbox";
import { useShiftRangeSelection } from "../../useShiftRangeSelection";

interface AttributesSectionProps {
  attributes: AttributeConfig[];
  /** The field being edited; enables hiding in a custom schema. */
  field?: string;
  /** The field's draft schema (for the shape/label access rows). */
  config?: unknown;
  onAddAttribute: (config: AttributeConfig) => void;
  onEditAttribute: (oldName: string, config: AttributeConfig) => void;
  onDeleteAttribute: (name: string) => void;
  onOrderChange?: (newOrder: AttributeConfig[]) => void;
  /** Keypoint fields only: offer the per-point scope toggle */
  allowPointScope?: boolean;
  /** Draft edits outside the attribute list (the access rows). */
  onConfigChange?: (config: object) => void;
  /** Video sample-level label types don't support dynamic attributes. */
  canAddAttributes?: boolean;
}

type Item = { id: string; data: ListItemProps };

const SectionLabel = ({
  title,
  count,
  selectAll,
}: {
  title: string;
  count: number;
  /** Tri-state select-all over the section's selectable rows. */
  selectAll?: React.ComponentProps<typeof SelectAllCheckbox>;
}) => (
  <EditSectionHeader style={{ marginTop: "0.5rem" }}>
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Sm}
      align={Align.Center}
    >
      {selectAll ? <SelectAllCheckbox {...selectAll} /> : null}
      <Text variant={TextVariant.Md} color={TextColor.Secondary}>
        {title}
      </Text>
      <Pill size={Size.Md}>{count}</Pill>
    </Stack>
  </EditSectionHeader>
);

const AttributesSection = ({
  attributes,
  field,
  config,
  canAddAttributes = true,
  onAddAttribute,
  onEditAttribute,
  onDeleteAttribute,
  onOrderChange,
  allowPointScope = false,
  onConfigChange,
}: AttributesSectionProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null);
  const [editingFormState, setEditingFormState] =
    useState<AttributeFormData | null>(null);
  const [selectedActive, setSelectedActive] = useAtom(selectedActiveAttributes);
  const [selectedHidden, setSelectedHidden] = useAtom(selectedHiddenAttributes);
  const pending = useAtomValue(pendingAttributeTiers);
  const docMode = useManagerDocMode();
  // Hiding is a custom-schema policy on an existing field.
  const canHide = Boolean(docMode && field);
  const doc = docMode?.doc;

  // Selections never outlive the list they were made in.
  useEffect(
    () => () => {
      setSelectedActive(new Set());
      setSelectedHidden(new Set());
    },
    [setSelectedActive, setSelectedHidden],
  );

  // Protected attributes (id, tags, index, geometry) can never be
  // hidden: no checkbox, and a stored hidden tier is ignored.
  const isHidden = useCallback(
    (name: string) => {
      if (!canHide || !field || PROTECTED_ATTRIBUTES.has(name)) return false;
      const tier =
        pending[name] ??
        (docAttributeHidden(doc, field, name) ? "hidden" : "annotate");
      return tier === "hidden";
    },
    [canHide, doc, field, pending],
  );

  const existingAttributeNames = useMemo(
    () => attributes.map((attr) => attr.name),
    [attributes],
  );

  const editNameError =
    editingAttribute && editingFormState
      ? getAttributeNameError(
          editingFormState.name,
          existingAttributeNames,
          editingAttribute,
        )
      : null;

  const editFormErrors = editingFormState
    ? getAttributeFormErrors(editingFormState)
    : null;

  const hasEditError =
    !!editNameError ||
    (editFormErrors ? hasAttributeFormError(editFormErrors) : false);

  const handleAddSave = useCallback(
    (config: AttributeConfig) => {
      onAddAttribute(config);
      setIsAdding(false);
    },
    [onAddAttribute],
  );

  const handleStartEdit = useCallback(
    (name: string) => {
      const config = attributes.find((attr) => attr.name === name);
      if (config) {
        setEditingAttribute(name);
        setEditingFormState(toFormData(config));
      }
    },
    [attributes],
  );

  const handleEditSave = useCallback(() => {
    if (!editingAttribute || !editingFormState || hasEditError) return;
    onEditAttribute(editingAttribute, toAttributeConfig(editingFormState));
    setEditingAttribute(null);
    setEditingFormState(null);
  }, [editingAttribute, editingFormState, hasEditError, onEditAttribute]);

  const handleCancelEdit = useCallback(() => {
    setEditingAttribute(null);
    setEditingFormState(null);
  }, []);

  const handleDeleteAttribute = useCallback(() => {
    if (editingAttribute) {
      onDeleteAttribute(editingAttribute);
      setEditingAttribute(null);
      setEditingFormState(null);
    }
  }, [editingAttribute, onDeleteAttribute]);

  const buildAttributeItem = useCallback(
    (attr: AttributeConfig, draggable: boolean): Item => {
      const name = attr.name;
      // Editing mode: use shared card item creator
      if (name === editingAttribute && editingFormState) {
        return createAttributeCardItem({
          id: name,
          title: "Edit attribute",
          formState: editingFormState,
          onFormStateChange: setEditingFormState,
          nameError: editNameError,
          canSave: !hasEditError,
          onSave: handleEditSave,
          onCancel: handleCancelEdit,
          onDelete: handleDeleteAttribute,
          canDrag: draggable,
          isEditing: true,
          readOnly: !!attr._source,
          allowPointScope,
        });
      }

      const typeLabel = getAttributeTypeLabel(attr.type);
      const optionCount = attr.values?.length;
      const secondaryParts = [typeLabel];
      if (optionCount !== undefined && optionCount > 0) {
        secondaryParts.push(
          `${optionCount} option${optionCount !== 1 ? "s" : ""}`,
        );
      }

      return {
        id: name,
        data: {
          canSelect: canHide && !PROTECTED_ATTRIBUTES.has(name),
          canDrag: draggable,
          "data-cy": `attribute-row-${name}`,
          primaryContent: name,
          secondaryContent: (
            <Stack
              orientation={Orientation.Row}
              spacing={Spacing.Sm}
              align={Align.Center}
            >
              <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                {secondaryParts.join(" · ")}
              </Text>
              {attr.scope === "point" && <Pill size={Size.Md}>Per-point</Pill>}
              {attr.read_only && <Pill size={Size.Md}>Read-only</Pill>}
              {attr.dynamic && <Pill size={Size.Md}>Dynamic</Pill>}
              {attr._source && <Pill size={Size.Md}>{attr._source}</Pill>}
            </Stack>
          ),
          actions: <EditAction onEdit={() => handleStartEdit(name)} />,
        } as ListItemProps,
      };
    },
    [
      allowPointScope,
      canHide,
      editingAttribute,
      editingFormState,
      editNameError,
      hasEditError,
      handleCancelEdit,
      handleDeleteAttribute,
      handleEditSave,
      handleStartEdit,
    ],
  );

  // Shape / label rows: never hideable, read-only is an inline toggle.
  const buildAccessItem = useCallback(
    (knob: AccessKnob): Item => {
      const schema = config as FieldSchema | undefined;
      return {
        id: `__${knob}__`,
        data: {
          canSelect: false,
          canDrag: false,
          "data-cy": `field-access-${knob}`,
          primaryContent: KNOB_LABELS[knob].title,
          secondaryContent: (
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {KNOB_LABELS[knob].hint}
            </Text>
          ),
          actions: (
            <Toggle
              data-cy={`field-access-${knob}-read-only`}
              size={Size.Sm}
              label="Read-only"
              checked={knobIsReadOnly(schema, knob)}
              onChange={(checked) =>
                onConfigChange?.({
                  ...(schema as object),
                  [knob]: checked ? "read_only" : "editable",
                })
              }
            />
          ),
        } as ListItemProps,
      };
    },
    [config, onConfigChange],
  );

  const { activeItems, hiddenItems } = useMemo(() => {
    const knobs = docMode
      ? accessKnobsFor(config as FieldSchema | undefined)
      : [];
    // Un-hideable (protected) attributes sit together at the bottom of
    // Active, like the protected fields in the manager.
    const active = attributes.filter((a) => !isHidden(a.name));
    const hideable = canHide
      ? active.filter((a) => !PROTECTED_ATTRIBUTES.has(a.name))
      : active;
    const protectedRows = canHide
      ? active.filter((a) => PROTECTED_ATTRIBUTES.has(a.name))
      : [];
    return {
      activeItems: [
        ...knobs.map(buildAccessItem),
        ...hideable.map((a) => buildAttributeItem(a, true)),
        ...protectedRows.map((a) => buildAttributeItem(a, true)),
      ],
      hiddenItems: attributes
        .filter((a) => isHidden(a.name))
        .map((a) => buildAttributeItem(a, false)),
    };
  }, [
    attributes,
    canHide,
    config,
    docMode,
    isHidden,
    buildAccessItem,
    buildAttributeItem,
  ]);

  // Reordering the Active list reorders the attributes; hidden ones
  // keep their relative positions after the active ones.
  const handleOrderChange = useCallback(
    (newItems: Item[]) => {
      const activeOrder = newItems
        .map((item) => attributes.find((attr) => attr.name === item.id))
        .filter((attr): attr is AttributeConfig => attr !== undefined);
      const rest = attributes.filter((attr) => isHidden(attr.name));
      onOrderChange?.([...activeOrder, ...rest]);
    },
    [attributes, isHidden, onOrderChange],
  );

  const setActiveSelection = useCallback(
    (ids: string[]) => {
      setSelectedActive(new Set(ids));
      setSelectedHidden(new Set());
    },
    [setSelectedActive, setSelectedHidden],
  );
  const setHiddenSelection = useCallback(
    (ids: string[]) => {
      setSelectedHidden(new Set(ids));
      setSelectedActive(new Set());
    },
    [setSelectedActive, setSelectedHidden],
  );
  // Shift-click selects a range within each section.
  const activeIds = useMemo(
    () => activeItems.filter((i) => i.data.canSelect).map((i) => i.id),
    [activeItems],
  );
  const hiddenIds = useMemo(
    () => hiddenItems.filter((i) => i.data.canSelect).map((i) => i.id),
    [hiddenItems],
  );
  const activeRange = useShiftRangeSelection(
    activeIds,
    setActiveSelection,
    "attribute-row-",
  );
  const hiddenRange = useShiftRangeSelection(
    hiddenIds,
    setHiddenSelection,
    "attribute-row-",
  );
  const onActiveSelected = activeRange.onSelected;
  const onHiddenSelected = hiddenRange.onSelected;

  const total = activeItems.length + hiddenItems.length;

  const activeList = (
    <SelectableList onMouseDownCapture={activeRange.onMouseDownCapture}>
      <RichList
        data-cy="active-attributes"
        listItems={activeItems}
        draggable={true}
        onOrderChange={handleOrderChange}
        onSelected={onActiveSelected}
        selected={[...selectedActive]}
      />
    </SelectableList>
  );

  return (
    <Section>
      <EditSectionHeader>
        <Text variant={TextVariant.Lg}>Attributes</Text>
        {canAddAttributes && (
          <Button
            size={Size.Md}
            variant={Variant.Secondary}
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
          >
            + Add attribute
          </Button>
        )}
      </EditSectionHeader>

      {/* Add new attribute card */}
      {isAdding && (
        <AddAttributeCard
          existingAttributes={existingAttributeNames}
          onSave={handleAddSave}
          onCancel={() => setIsAdding(false)}
          allowPointScope={allowPointScope}
        />
      )}

      {total === 0 && !isAdding ? (
        <EmptyStateBox>
          <Text color={TextColor.Secondary}>No attributes defined</Text>
        </EmptyStateBox>
      ) : total === 0 ? null : (
        <>
          <SectionLabel
            title="Active"
            count={activeItems.length}
            selectAll={
              canHide
                ? {
                    ids: activeItems
                      .filter((i) => i.data.canSelect)
                      .map((i) => i.id),
                    selected: selectedActive,
                    onChange: setActiveSelection,
                    label: "Select all active attributes",
                    "data-cy": "select-all-active-attributes",
                  }
                : undefined
            }
          />
          {activeItems.length ? (
            activeList
          ) : (
            <EmptyStateBox>
              <Text color={TextColor.Secondary}>No active attributes</Text>
            </EmptyStateBox>
          )}

          <SectionLabel
            title="Hidden"
            count={hiddenItems.length}
            selectAll={
              canHide
                ? {
                    ids: hiddenItems
                      .filter((i) => i.data.canSelect)
                      .map((i) => i.id),
                    selected: selectedHidden,
                    onChange: setHiddenSelection,
                    label: "Select all hidden attributes",
                    "data-cy": "select-all-hidden-attributes",
                  }
                : undefined
            }
          />
          {hiddenItems.length ? (
            <SelectableList onMouseDownCapture={hiddenRange.onMouseDownCapture}>
              <RichList
                data-cy="hidden-attributes"
                listItems={hiddenItems}
                draggable={false}
                onSelected={onHiddenSelected}
                selected={[...selectedHidden]}
              />
            </SelectableList>
          ) : (
            <EmptyStateBox>
              <Text color={TextColor.Secondary}>
                {canHide
                  ? "No hidden attributes. Select active attributes and move them here to hide them in this schema."
                  : "The default schema shows every attribute. To hide attributes, create a custom schema and edit the field there."}
              </Text>
            </EmptyStateBox>
          )}
        </>
      )}
    </Section>
  );
};

export default AttributesSection;
