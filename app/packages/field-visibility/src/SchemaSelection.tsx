/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The "Selection" tab: the toggle controls row and the schema rows.
 */

import { useSchemaSettings, useSearchSchemaFields } from "@fiftyone/state";
import { EMBEDDED_DOCUMENT_FIELD } from "@fiftyone/utilities";
import { Orientation, Stack } from "@voxel51/voodo";
import { useEffect } from "react";
import { SchemaSearchHelp } from "./SchemaSearchHelp";
import { SchemaSelectionControls } from "./SchemaSelectControls";
import { SchemaSelectionRow } from "./SchemaSelectionRow";

export const SchemaSelection = () => {
  const {
    finalSchema,
    isFilterRuleActive,
    showMetadata,
    finalSchemaKeyByPath,
    setExpandedPaths,
    expandedPaths,
    mergedSchema,
  } = useSchemaSettings();
  const { searchResults } = useSearchSchemaFields(mergedSchema);

  const showSearchHelp = isFilterRuleActive && !searchResults?.length;
  const showSelection = !showSearchHelp;

  useEffect(() => {
    if (showMetadata && finalSchema && !expandedPaths) {
      const res = {};
      finalSchema.forEach((entry) => {
        if (entry?.info || entry?.description) {
          res[entry.path] = entry;
        }
      });
      setExpandedPaths(res);
    } else if (!showMetadata && !!expandedPaths) {
      setExpandedPaths(null);
    }
  }, [expandedPaths, finalSchema, setExpandedPaths, showMetadata]);

  return (
    <Stack orientation={Orientation.Column}>
      <SchemaSelectionControls />
      <div style={{ marginTop: "1rem", overflow: "auto" }}>
        {showSearchHelp && <SchemaSearchHelp />}
        {showSelection &&
          finalSchema?.map(
            ({ path, count, pathLabelFinal, skip, disabled, isSelected }) => {
              if (skip) return null;

              const field = finalSchemaKeyByPath[path];
              const fInfo = field?.info;
              const fDesc = field?.description;
              const ftype: string = field?.ftype || "";
              const embedDocType = field?.embeddedDocType;

              let docTypeLabel = ftype.substring(
                ftype.lastIndexOf(".") + 1,
                ftype.length,
              );

              docTypeLabel =
                ftype === EMBEDDED_DOCUMENT_FIELD
                  ? embedDocType.substring(
                      embedDocType.lastIndexOf(".") + 1,
                      embedDocType.length,
                    )
                  : docTypeLabel;

              return (
                <SchemaSelectionRow
                  key={path}
                  path={path}
                  isSelected={isSelected}
                  count={count}
                  disabled={disabled}
                  pathLabelFinal={pathLabelFinal}
                  docTypeLabel={docTypeLabel}
                  isExpandable={fInfo || fDesc}
                  info={fInfo}
                  description={fDesc}
                />
              );
            },
          )}
      </div>
    </Stack>
  );
};
