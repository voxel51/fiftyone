/**
 * Active Fields Section Component
 *
 * Displays the list of active (visible) fields with drag-drop reordering.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { useOperatorExecutor } from "@fiftyone/operators";
import {
  Anchor,
  Button,
  Clickable,
  Icon,
  IconName,
  Pill,
  RichList,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { atom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { fieldAttributeCount, fieldType } from "../state";
import { fieldIsReadOnly } from "./state";
import { GUISectionHeader } from "./styled";
import { Item } from "./Components";
import {
  useActiveFieldsList,
  useNewFieldMode,
  useSelectedActiveFields,
  useSetCurrentField,
} from "./hooks";
import { buildFieldSecondaryContent } from "./utils";

/**
 * Edit action button for field rows
 */
const FieldActions = ({ path }: { path: string }) => {
  const setField = useSetCurrentField();

  return (
    <Tooltip
      content="Configure annotation schema"
      anchor={Anchor.Bottom}
      portal
    >
      <Clickable onClick={() => setField(path)}>
        <Icon name={IconName.Edit} size={Size.Md} />
      </Clickable>
    </Tooltip>
  );
};

const ActiveFieldsSection = () => {
  const { isEnabled: isM4Enabled } = useFeature({
    feature: FeatureFlag.VFF_ANNOTATION_M4,
  });

  const { setIsNewField: setNewFieldMode } = useNewFieldMode();

  const handleNewField = useCallback(() => {
    setNewFieldMode(true);
  }, [setNewFieldMode]);

  const { fields, setFields } = useActiveFieldsList();
  const { setSelected } = useSelectedActiveFields();

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
          primaryContent: path,
          secondaryContent: buildFieldSecondaryContent(
            fieldTypes[path],
            fieldAttrCounts[path],
            false
          ),
          actions: (
            <span className="flex items-center gap-2">
              {isM4Enabled && fieldReadOnlyStates[path] && (
                <Pill size={Size.Md}>Read-only</Pill>
              )}
              <FieldActions path={path} />
            </span>
          ),
        } as ListItemProps,
      })),
    [fields, fieldTypes, fieldAttrCounts, fieldReadOnlyStates, isM4Enabled]
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
    },
    [setSelected]
  );

  if (!fields?.length) {
    return (
      <>
        <GUISectionHeader>
          <Text variant={TextVariant.MdBold}>Active fields</Text>
          <Tooltip
            content="Fields currently active and available for dataset annotation"
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
      </>
    );
  }

  return (
    <>
      <GUISectionHeader>
        <Text variant={TextVariant.MdBold}>Active fields</Text>
        <Tooltip
          content="Fields currently active and available for dataset annotation"
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
        listItems={listItems}
        draggable={true}
        onOrderChange={handleOrderChange}
        onSelected={handleSelected}
      />
    </>
  );
};

export default ActiveFieldsSection;
