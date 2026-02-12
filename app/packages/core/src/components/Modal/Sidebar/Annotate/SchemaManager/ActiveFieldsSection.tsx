/**
 * Active Fields Section Component
 *
 * Displays the list of active (visible) fields with drag-drop reordering.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import type { ListItemProps } from "@voxel51/voodo";
import {
  Anchor,
  Button,
  Icon,
  IconName,
  Pill,
  RichList,
  Size,
  Text,
  TextColor,
  textColorClass,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { atom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { fieldAttributeCount, fieldType } from "../state";
import { Item } from "./Components";
import {
  useActiveFieldsList,
  useNewFieldMode,
  useSelectedActiveFields,
  useSelectedHiddenFields,
  useSetCurrentField,
} from "./hooks";
import SecondaryText from "./SecondaryText";
import { fieldIsReadOnly } from "./state";
import { GUISectionHeader } from "./styled";

/**
 * Edit action button for field rows
 */
const FieldActions = ({ path }: { path: string }) => {
  const setField = useSetCurrentField();

  return (
    <Tooltip
      content={<Text>Configure label schema</Text>}
      anchor={Anchor.Bottom}
      portal
    >
      <Button
        variant={Variant.Icon}
        borderless
        data-cy="edit"
        onClick={() => setField(path)}
      >
        <Icon
          name={IconName.Edit}
          size={Size.Md}
          className={textColorClass(TextColor.Secondary)}
        />
      </Button>
    </Tooltip>
  );
};

const ActiveFieldsSection = () => {
  const { setIsNewField: setNewFieldMode } = useNewFieldMode();

  const handleNewField = useCallback(() => {
    setNewFieldMode(true);
  }, [setNewFieldMode]);

  const { fields, setFields } = useActiveFieldsList();
  const { selected, setSelected } = useSelectedActiveFields();
  const { setSelected: setHiddenSelected } = useSelectedHiddenFields();

  // Batch field data fetching
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
          "data-cy": `field-row-${path}`,
          primaryContent: path,
          secondaryContent: (
            <SecondaryText
              fieldType={fieldTypes[path] ?? ""}
              attrCount={fieldAttrCounts[path]}
              isSystemReadOnly={false}
            />
          ),
          actions: (
            <span className="flex items-center gap-2">
              {fieldReadOnlyStates[path] && (
                <Pill size={Size.Md}>Read-only</Pill>
              )}
              <FieldActions path={path} />
            </span>
          ),
        } as ListItemProps,
      })),
    [fields, fieldTypes, fieldAttrCounts, fieldReadOnlyStates]
  );

  const handleOrderChange = useCallback(
    (newItems: { id: string; data: ListItemProps }[]) => {
      const newOrder = newItems.map((item) => item.id);
      // Update UI immediately
      setFields(newOrder);
      // Persist to DB
      setActiveSchemas.execute({ fields: newOrder });
    },
    [setFields, setActiveSchemas]
  );

  const handleSelected = useCallback(
    (selectedIds: string[]) => {
      setSelected(new Set(selectedIds));
      setHiddenSelected(new Set());
    },
    [setHiddenSelected, setSelected]
  );

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  if (!fields?.length) {
    return (
      <div style={{ marginTop: "0.5rem" }}>
        <GUISectionHeader>
          <Text
            variant={TextVariant.Lg}
            style={{ fontWeight: 500 }}
            color={TextColor.Secondary}
          >
            Active fields
          </Text>
          <Tooltip
            content={
              <Text>
                Fields currently active and available for dataset annotation
              </Text>
            }
            anchor={Anchor.Bottom}
            portal
          >
            <Icon name={IconName.Info} size={Size.Md} />
          </Tooltip>
          <Pill size={Size.Md}>0</Pill>
          <div style={{ flex: 1 }} />
          <Button
            size={Size.Md}
            variant={Variant.Primary}
            onClick={handleNewField}
          >
            New field
          </Button>
        </GUISectionHeader>
        <Item style={{ justifyContent: "center", opacity: 0.7 }}>
          <Text color={TextColor.Secondary}>No active fields</Text>
        </Item>
      </div>
    );
  }

  return (
    <>
      <GUISectionHeader>
        <Text
          variant={TextVariant.Lg}
          style={{ fontWeight: 500 }}
          color={TextColor.Secondary}
        >
          Active fields
        </Text>
        <Tooltip
          content={
            <Text>
              Fields currently active and available for dataset annotation
            </Text>
          }
          anchor={Anchor.Top}
          portal
        >
          <Icon name={IconName.Info} size={Size.Md} />
        </Tooltip>
        <Pill size={Size.Md}>{fields.length}</Pill>
        <div style={{ flex: 1 }} />
        <Button
          size={Size.Md}
          variant={Variant.Primary}
          onClick={handleNewField}
        >
          New field
        </Button>
      </GUISectionHeader>
      <RichList
        data-cy={"active-fields"}
        listItems={listItems}
        draggable={true}
        onOrderChange={handleOrderChange}
        onSelected={handleSelected}
        selected={selectedList}
      />
    </>
  );
};

export default ActiveFieldsSection;
