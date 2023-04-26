import React from "react";
import { Box, Typography } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";
import { SchemaSelectionControls } from "./SchemaSelectControls";
import { SchemaSearchHelp } from "./SchemaSearchHelp";

interface Props {
  mode?: "default" | "search";
}

export const SchemaSelection = (props: Props) => {
  const { mode = "default" } = props;
  const isSearchMode = mode === "search";

  const theme = useTheme();
  const { toggleSelection, finalSchema, searchResults } = useSchemaSettings();

  const showSearchHelp = isSearchMode && !searchResults?.length;
  const showSelection = !showSearchHelp;

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ position: "relative !important" }}
    >
      {!isSearchMode && <SchemaSelectionControls />}

      <Box
        style={{
          position: "relative",
          height: "50vh",
          marginTop: "1rem",
          overflow: "auto",
          color: "#232323",
          border: `1px solid ${theme.primary.plainBorder}`,
        }}
      >
        {showSearchHelp && <SchemaSearchHelp />}
        {showSelection &&
          finalSchema.map((item) => {
            const { path, count, isSelected, pathLabelFinal, skip, disabled } =
              item;

            if (skip) return null;

            return (
              <Box
                style={{
                  padding: "0.25rem 0.25rem",
                  borderBottom: `1px solid ${theme.primary.plainBorder}`,
                  display: "flex",
                }}
                key={path}
              >
                <Box>
                  <Checkbox
                    name={"Carousel"}
                    value={path}
                    checked={isSelected}
                    onChange={() => {
                      toggleSelection(path, isSelected);
                    }}
                    style={{
                      padding: 0,
                    }}
                    disabled={disabled}
                  />
                </Box>
                <Box
                  style={{
                    paddingLeft: `${(count - 1) * 15 + 5}px`,
                    color: disabled ? theme.text.tertiary : theme.text.primary,
                  }}
                >
                  {pathLabelFinal}
                </Box>
              </Box>
            );
          })}
      </Box>
    </Box>
  );
};
