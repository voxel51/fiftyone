import React from "react";
import { Box } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";
import { TAB_OPTIONS_MAP } from "@fiftyone/state/src/hooks/useSchemaSettings";

interface Props {}

export const SchemaSelectionControls = (props: Props) => {
  const theme = useTheme();
  const {
    fieldsOnly,
    setFieldsOnly,
    allFieldsChecked,
    setAllFieldsChecked,
    selectedTab,
    showMetadata,
    setShowMetadata,
    searchResults,
  } = useSchemaSettings();
  const isFilterRuleMode = selectedTab === TAB_OPTIONS_MAP.FILTER_RULE;

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ position: "relative !important" }}
    >
      <Box display="flex" width="100%" flexDirection="column">
        {isFilterRuleMode && (
          <Box
            style={{
              position: "relative",
              padding: "0.75rem 0.5rem 0 0.5rem",
              color: !searchResults.length
                ? theme.text.secondary
                : theme.text.primary,
              display: "flex",
            }}
          >
            Show metadata
            <Checkbox
              name={"Carousel"}
              value={showMetadata}
              checked={showMetadata || !searchResults.length}
              onChange={() => setShowMetadata(!showMetadata)}
              style={{ padding: "4px" }}
              disabled={!searchResults.length}
            />
          </Box>
        )}
        {!isFilterRuleMode && (
          <Box
            style={{
              position: "relative",
              padding: "0.5rem 0",
              color: theme.text.primary,
              display: "flex",
            }}
          >
            Show nested fields
            <Checkbox
              name={"Carousel"}
              value={!fieldsOnly}
              checked={!fieldsOnly}
              onChange={() => setFieldsOnly(!fieldsOnly)}
              style={{ padding: "4px" }}
            />
          </Box>
        )}
        {!allFieldsChecked && !isFilterRuleMode && (
          <Box
            style={{
              position: "relative",
              color: theme.text.primary,
              display: "flex",
            }}
          >
            Select All
            <Checkbox
              name={"Carousel"}
              value={allFieldsChecked}
              checked={allFieldsChecked}
              onChange={() => setAllFieldsChecked(!allFieldsChecked)}
              style={{ padding: "4px" }}
            />
          </Box>
        )}
        {allFieldsChecked && !isFilterRuleMode && (
          <Box
            style={{
              position: "relative",
              color: theme.text.primary,
              display: "flex",
            }}
          >
            Deselect All
            <Checkbox
              name={"Carousel"}
              value={allFieldsChecked}
              checked={allFieldsChecked}
              onChange={() => setAllFieldsChecked(!allFieldsChecked)}
              style={{ padding: "4px" }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};
