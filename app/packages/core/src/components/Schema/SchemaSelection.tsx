import { getEventBus } from "@fiftyone/events";
import { useEffect, useRef } from "react";
import { Box } from "@mui/material";

import { useSchemaSettings, useSearchSchemaFields } from "@fiftyone/state";
import { SchemaSelectionControls } from "./SchemaSelectControls";
import { SchemaSearchHelp } from "./SchemaSearchHelp";
import { EMBEDDED_DOCUMENT_FIELD } from "@fiftyone/utilities";
import { SchemaSelectionRow } from "./SchemaSelectionRow";

/** e2e specs wait on the field rows the selection list shows, as they change */
type SchemaSelectionE2EEvents = {
  "e2e:schema:selection-shown": {
    /** the shown rows' paths, comma-joined in order */
    shown: string;
    /** the checked rows' paths, comma-joined in order */
    checked: string;
    metadata: boolean;
  };
};

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
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (showMetadata && finalSchema && !expandedPaths) {
      const res = {};
      finalSchema.forEach((entry) => {
        if (entry?.info || entry?.description) {
          res[entry.path] = entry;
        }
      });
      setExpandedPaths(res);
      return;
    } else if (!showMetadata && !!expandedPaths) {
      setExpandedPaths(null);
      return;
    }

    const rows = showSelection
      ? (finalSchema ?? []).filter(({ skip }) => !skip)
      : [];
    const shown = {
      shown: rows.map(({ path }) => path).join(","),
      checked: rows
        .filter(({ isSelected }) => isSelected)
        .map(({ path }) => path)
        .join(","),
      metadata: Boolean(showMetadata),
    };
    const key = JSON.stringify(shown);
    if (key === announced.current) return;
    announced.current = key;
    getEventBus<SchemaSelectionE2EEvents>().dispatch(
      "e2e:schema:selection-shown",
      shown,
    );
  }, [
    expandedPaths,
    finalSchema,
    setExpandedPaths,
    showMetadata,
    showSelection,
  ]);

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
      </Box>
    </Box>
  );
};
