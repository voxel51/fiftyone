/**
 * Hidden Fields Section Component
 *
 * Displays the collapsible list of hidden fields.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
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
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { useCallback, useMemo, useState } from "react";
import SecondaryText from "./SecondaryText";
import { isSystemReadOnlyField } from "./constants";
import {
  useFieldIsReadOnly,
  useFieldSchemaData,
  useHiddenFieldsWithMetadata,
  useSelectedHiddenFields,
  useSetCurrentField,
} from "./hooks";
import { CollapsibleHeader, GUISectionHeader } from "./styled";

/**
 * Actions component for hidden field rows
 */
const HiddenFieldActions = ({
  path,
  hasSchema,
}: {
  path: string;
  hasSchema: boolean;
}) => {
  const { isEnabled: isM4Enabled } = useFeature({
    feature: FeatureFlag.VFF_ANNOTATION_M4,
  });
  const setField = useSetCurrentField();
  const fieldData = useFieldSchemaData(path);
  const isSystemReadOnly = isSystemReadOnlyField(path);
  const isUnsupported = fieldData?.unsupported ?? false;
  const isReadOnly = useFieldIsReadOnly(path);

  return (
    <span className="flex items-center gap-2">
      {isUnsupported && (
        <Pill data-cy="pill" size={Size.Md}>
          Unsupported
        </Pill>
      )}
      {isM4Enabled && (isReadOnly || isSystemReadOnly) && (
        <Pill data-cy="pill" size={Size.Md}>
          Read-only
        </Pill>
      )}
      {!isSystemReadOnly && !isUnsupported && (
        <>
          {hasSchema ? (
            <Tooltip
              content="Configure annotation schema"
              anchor={Anchor.Bottom}
              portal
            >
              <Clickable data-cy={"edit"} onClick={() => setField(path)}>
                <Icon name={IconName.Edit} size={Size.Md} />
              </Clickable>
            </Tooltip>
          ) : (
            <Button
              size={Size.Sm}
              variant={Variant.Secondary}
              onClick={() => setField(path)}
            >
              Scan
            </Button>
          )}
        </>
      )}
    </span>
  );
};

const HiddenFieldsSection = () => {
  const {
    fields,
    types: fieldTypes,
    attrCounts: fieldAttrCounts,
    hasSchemaStates: fieldHasSchemaStates,
  } = useHiddenFieldsWithMetadata();
  const [expanded, setExpanded] = useState(true);
  const { setSelected } = useSelectedHiddenFields();

  const listItems = useMemo(
    () =>
      fields.map((path) => {
        const isSystemReadOnly = isSystemReadOnlyField(path);
        const hasSchema = fieldHasSchemaStates[path];
        const canSelect = hasSchema && !isSystemReadOnly;

        // Add left padding when no checkbox is shown to maintain alignment
        const paddingStyle = !canSelect
          ? { paddingLeft: "0.25rem" }
          : undefined;

        return {
          id: path,
          data: {
            canSelect,
            canDrag: false,
            "data-cy": `field-row-${path}`,
            primaryContent: path,
            secondaryContent: (
              <SecondaryText
                fieldType={fieldTypes[path] ?? ""}
                attrCount={fieldAttrCounts[path]}
                isSystemReadOnly={isSystemReadOnly}
              />
            ),
            actions: <HiddenFieldActions path={path} hasSchema={hasSchema} />,
          } as ListItemProps,
        };
      }),
    [fields, fieldTypes, fieldAttrCounts, fieldHasSchemaStates]
  );

  const handleSelected = useCallback(
    (selectedIds: string[]) => {
      setSelected(new Set(selectedIds));
    },
    [setSelected]
  );

  if (!fields.length) {
    return null;
  }

  return (
    <>
      <GUISectionHeader>
        <CollapsibleHeader
          onClick={() => setExpanded((v) => !v)}
          style={{ padding: 0, flex: "none" }}
        >
          <Text variant={TextVariant.Lg} style={{ fontWeight: 500 }}>
            Hidden fields
          </Text>
          {expanded ? (
            <Icon name={IconName.ChevronTop} size={Size.Md} />
          ) : (
            <Icon name={IconName.ChevronBottom} size={Size.Md} />
          )}
        </CollapsibleHeader>
        <Tooltip
          content="Fields currently hidden and not available for dataset annotation"
          anchor={Anchor.Top}
          portal
        >
          <Icon name={IconName.Info} size={Size.Md} />
        </Tooltip>
        <Pill size={Size.Md}>{fields.length}</Pill>
      </GUISectionHeader>
      {expanded && (
        <RichList
          data-cy={"hidden-fields"}
          listItems={listItems}
          draggable={false}
          onSelected={handleSelected}
        />
      )}
    </>
  );
};

export default HiddenFieldsSection;
