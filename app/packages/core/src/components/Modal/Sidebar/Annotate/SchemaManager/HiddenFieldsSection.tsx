/**
 * Hidden Fields Section Component
 *
 * Displays the collapsible list of hidden fields.
 */

import { mediaType as mediaTypeAtom } from "@fiftyone/state";
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
import { useCallback, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { VIDEO_UNSUPPORTED_TOOLTIP } from "../Actions";
import SecondaryText from "./SecondaryText";
import { isSystemReadOnlyField } from "./constants";
import {
  useFieldIsReadOnly,
  useFieldSchemaData,
  useHiddenFieldsWithMetadata,
  useSelectedActiveFields,
  useSelectedHiddenFields,
  useSetCurrentField,
} from "./hooks";
import { CollapsibleHeader, GUISectionHeader } from "./styled";
import { isFieldLabelTypeUnsupported } from "./utils";

/**
 * Actions component for hidden field rows
 */
const HiddenFieldActions = ({
  path,
  hasSchema,
  fieldType,
  mediaType,
}: {
  path: string;
  hasSchema: boolean;
  fieldType: string | undefined;
  mediaType: string | null | undefined;
}) => {
  const setField = useSetCurrentField();
  const fieldData = useFieldSchemaData(path);
  const isSystemReadOnly = isSystemReadOnlyField(path);
  const isLabelTypeUnsupported = isFieldLabelTypeUnsupported(
    path,
    fieldType,
    mediaType,
  );
  const isUnsupported =
    (fieldData?.unsupported ?? false) || isLabelTypeUnsupported;
  const isReadOnly = useFieldIsReadOnly(path);

  return (
    <span className="flex items-center gap-2">
      {isUnsupported &&
        (isLabelTypeUnsupported ? (
          <Tooltip
            content={<Text>{VIDEO_UNSUPPORTED_TOOLTIP}</Text>}
            anchor={Anchor.Bottom}
            portal
          >
            <Pill data-cy="pill" size={Size.Md}>
              Unsupported
            </Pill>
          </Tooltip>
        ) : (
          <Pill data-cy="pill" size={Size.Md}>
            Unsupported
          </Pill>
        ))}
      {(isReadOnly || isSystemReadOnly) && (
        <Pill data-cy="pill" size={Size.Md}>
          Read-only
        </Pill>
      )}
      {!isSystemReadOnly && !isUnsupported && (
        <>
          {hasSchema ? (
            <Tooltip
              content={<Text>Configure annotation schema</Text>}
              anchor={Anchor.Bottom}
              portal
            >
              <Button
                variant={Variant.Icon}
                borderless
                data-cy={"edit"}
                onClick={() => setField(path)}
              >
                <Icon
                  name={IconName.Edit}
                  size={Size.Md}
                  className={textColorClass(TextColor.Secondary)}
                />
              </Button>
            </Tooltip>
          ) : (
            <Button
              data-cy="scan"
              size={Size.Sm}
              variant={Variant.Secondary}
              onClick={() => setField(path)}
            >
              Setup
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
  const { selected, setSelected } = useSelectedHiddenFields();
  const { setSelected: setActiveSelected } = useSelectedActiveFields();
  const currentMediaType = useRecoilValue(mediaTypeAtom);

  const listItems = useMemo(
    () =>
      fields.map((path) => {
        const isSystemReadOnly = isSystemReadOnlyField(path);
        const hasSchema = fieldHasSchemaStates[path];
        const isLabelTypeUnsupported = isFieldLabelTypeUnsupported(
          path,
          fieldTypes[path],
          currentMediaType,
        );
        const canSelect =
          hasSchema && !isSystemReadOnly && !isLabelTypeUnsupported;

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
            actions: (
              <HiddenFieldActions
                path={path}
                hasSchema={hasSchema}
                fieldType={fieldTypes[path]}
                mediaType={currentMediaType}
              />
            ),
          } as ListItemProps,
        };
      }),
    [
      fields,
      fieldTypes,
      fieldAttrCounts,
      fieldHasSchemaStates,
      currentMediaType,
    ],
  );

  const handleSelected = useCallback(
    (selectedIds: string[]) => {
      setSelected(new Set(selectedIds));
      setActiveSelected(new Set());
    },
    [setActiveSelected, setSelected],
  );

  const selectedList = useMemo(() => Array.from(selected), [selected]);

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
          <Text
            variant={TextVariant.Lg}
            color={TextColor.Secondary}
            style={{ fontWeight: 500 }}
          >
            Hidden fields
          </Text>
          {expanded ? (
            <Icon name={IconName.ChevronTop} size={Size.Md} />
          ) : (
            <Icon name={IconName.ChevronBottom} size={Size.Md} />
          )}
        </CollapsibleHeader>
        <Tooltip
          content={
            <Text>
              Fields currently hidden and not available in the "Annotate" tab
            </Text>
          }
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
          selected={selectedList}
        />
      )}
    </>
  );
};

export default HiddenFieldsSection;
