/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The toggle row above the schema rows: metadata, nested fields, select all.
 */

import { ExternalLink } from "@fiftyone/components";
import { useSchemaSettings, useSearchSchemaFields } from "@fiftyone/state";
import {
  Align,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Toggle,
} from "@voxel51/voodo";
import { useMemo } from "react";

const FIELD_METADATA =
  "https://docs.voxel51.com/user_guide/using_datasets.html#storing-field-metadata";

export const SchemaSelectionControls = () => {
  const {
    showNestedFields,
    setShowNestedFields,
    allFieldsChecked,
    setAllFieldsChecked,
    isFilterRuleActive,
    showMetadata,
    setShowMetadata,
    includeNestedFields,
    setIncludeNestedFields,
    mergedSchema,
  } = useSchemaSettings();

  const { searchResults } = useSearchSchemaFields(mergedSchema);
  const showMetadataVisible = !(isFilterRuleActive && !searchResults.length);
  const includeNestedVisible = !!(isFilterRuleActive && searchResults.length);

  const controlList = useMemo(() => {
    return [
      {
        label: "Show field metadata",
        link: FIELD_METADATA,
        isVisible: showMetadataVisible,
        checked: showMetadata,
        onChange: () => setShowMetadata(!showMetadata),
      },
      {
        label: "Include nested fields",
        isVisible: includeNestedVisible,
        checked: includeNestedFields,
        onChange: () => setIncludeNestedFields(!includeNestedFields),
        disabled: !searchResults.length,
      },
      {
        label: "Show nested fields",
        isVisible: !isFilterRuleActive,
        checked: showNestedFields,
        onChange: () => setShowNestedFields(!showNestedFields),
      },
      {
        label: "Select all",
        isVisible: !isFilterRuleActive,
        checked: allFieldsChecked,
        onChange: () => setAllFieldsChecked(!allFieldsChecked),
      },
    ];
  }, [
    showMetadataVisible,
    showMetadata,
    includeNestedVisible,
    includeNestedFields,
    searchResults.length,
    isFilterRuleActive,
    showNestedFields,
    allFieldsChecked,
    setShowMetadata,
    setIncludeNestedFields,
    setShowNestedFields,
    setAllFieldsChecked,
  ]);

  return (
    <Stack
      orientation={Orientation.Row}
      style={{ width: "100%", marginTop: "1rem" }}
    >
      {controlList
        .filter(({ isVisible }) => isVisible)
        .map(({ label, checked, onChange, disabled = false, link }) => (
          <Stack
            key={label}
            orientation={Orientation.Row}
            align={Align.Center}
            spacing={Spacing.Xs}
            style={{ flex: 1, padding: "0.35rem 1rem 0.35rem 0" }}
          >
            <Toggle
              checked={checked}
              onChange={onChange}
              disabled={disabled}
              label={label}
              data-cy={`field-visibility-controls-${label
                .toLowerCase()
                .replace(/ /g, "-")}`}
            />
            {link && (
              <ExternalLink
                href={link}
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                <Icon name={IconName.ExternalLink} size={Size.Sm} />
              </ExternalLink>
            )}
          </Stack>
        ))}
    </Stack>
  );
};
