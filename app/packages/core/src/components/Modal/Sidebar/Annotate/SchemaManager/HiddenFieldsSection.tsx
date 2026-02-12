/**
 * Hidden Fields Section Component
 *
 * Displays the collapsible list of hidden fields.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { Collapse, Typography } from "@mui/material";
import {
  Anchor,
  Clickable,
  Icon,
  IconName,
  Pill,
  RichList,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import type { ListItemProps } from "@voxel51/voodo";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { labelSchemaData } from "../state";
import { isSystemReadOnlyField } from "./constants";
import {
  currentField,
  fieldIsReadOnly,
  hiddenFieldAttrCounts,
  hiddenFieldHasSchemaStates,
  hiddenFieldTypes,
  selectedHiddenFields,
  sortedInactivePaths,
} from "./state";
import { CollapsibleHeader, GUISectionHeader } from "./styled";
import { buildFieldSecondaryContent } from "./utils";

/**
 * Actions component for hidden field rows
 */
const HiddenFieldActions = ({ path }: { path: string }) => {
  const { isEnabled: isM4Enabled } = useFeature({
    feature: FeatureFlag.VFF_ANNOTATION_M4,
  });
  const setField = useSetAtom(currentField);
  const fieldData = useAtomValue(labelSchemaData(path));
  const isSystemReadOnly = isSystemReadOnlyField(path);
  const isUnsupported = fieldData?.unsupported ?? false;
  const isReadOnly = useAtomValue(fieldIsReadOnly(path));

  return (
    <span className="flex items-center gap-2">
      {isUnsupported && <Pill size={Size.Md}>Unsupported</Pill>}
      {isM4Enabled && (isReadOnly || isSystemReadOnly) && (
        <Pill size={Size.Md}>Read-only</Pill>
      )}
      {!isSystemReadOnly && !isUnsupported && (
        <Tooltip
          content="Configure annotation schema"
          anchor={Anchor.Bottom}
          portal
        >
          <Clickable onClick={() => setField(path)}>
            <Icon name={IconName.Edit} size={Size.Md} />
          </Clickable>
        </Tooltip>
      )}
    </span>
  );
};

const HiddenFieldsSection = () => {
  const fields = useAtomValue(sortedInactivePaths);
  const [expanded, setExpanded] = useState(true);
  const [, setSelected] = useAtom(selectedHiddenFields);

  // Use batched selectors from state
  const fieldTypes = useAtomValue(hiddenFieldTypes);
  const fieldAttrCounts = useAtomValue(hiddenFieldAttrCounts);
  const fieldHasSchemaStates = useAtomValue(hiddenFieldHasSchemaStates);

  const listItems = useMemo(
    () =>
      fields.map((path) => {
        const isSystemReadOnly = isSystemReadOnlyField(path);
        const hasSchema = fieldHasSchemaStates[path];

        return {
          id: path,
          data: {
            canSelect: hasSchema && !isSystemReadOnly,
            canDrag: false,
            primaryContent: path,
            secondaryContent: buildFieldSecondaryContent(
              fieldTypes[path],
              fieldAttrCounts[path],
              isSystemReadOnly
            ),
            actions: <HiddenFieldActions path={path} />,
          } as ListItemProps,
        };
      }),
    [fields, fieldTypes, fieldAttrCounts, fieldHasSchemaStates]
  );

  const handleSelected = useCallback((selectedIds: string[]) => {
    setSelected(new Set(selectedIds));
  }, []);

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
          <Typography variant="body1" fontWeight={500}>
            Hidden fields
          </Typography>
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
      <Collapse in={expanded}>
        <RichList
          listItems={listItems}
          draggable={false}
          onSelected={handleSelected}
        />
      </Collapse>
    </>
  );
};

export default HiddenFieldsSection;
