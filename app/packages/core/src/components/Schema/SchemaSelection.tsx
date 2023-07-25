import React, { useEffect } from "react";
import { Box } from "@mui/material";

import { useSchemaSettings, useSearchSchemaFields } from "@fiftyone/state";
import { SchemaSelectionControls } from "./SchemaSelectControls";
import { SchemaSearchHelp } from "./SchemaSearchHelp";
import { EMBEDDED_DOCUMENT_FIELD } from "@fiftyone/utilities";
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
    <Box
      display="flex"
      flexDirection="column"
      sx={{ position: "relative !important" }}
    >
      <SchemaSelectionControls />
      <Box
        style={{
          position: "relative",
          height: "100%",
          marginTop: "1rem",
          overflow: "auto",
          color: "#232323",
        }}
      >
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
                ftype.length
              );

              docTypeLabel =
                ftype === EMBEDDED_DOCUMENT_FIELD
                  ? embedDocType.substring(
                      embedDocType.lastIndexOf(".") + 1,
                      embedDocType.length
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
            }
          )}
      </Box>
    </Box>
  );
};
