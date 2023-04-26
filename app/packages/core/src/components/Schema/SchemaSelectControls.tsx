import React from "react";
import { Box } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";

interface Props {}

export const SchemaSelectionControls = (props: Props) => {
  const theme = useTheme();
  const { fieldsOnly, setFieldsOnly, allFieldsChecked, setAllFieldsChecked } =
    useSchemaSettings();

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ position: "relative !important" }}
    >
      <Box display="flex" width="100%" flexDirection="column">
        <Box
          style={{
            position: "relative",
            padding: "0.5rem 0",
            color: theme.text.primary,
            display: "flex",
          }}
        >
          Show attributes
          <Checkbox
            name={"Carousel"}
            value={!fieldsOnly}
            checked={!fieldsOnly}
            onChange={() => setFieldsOnly(!fieldsOnly)}
            style={{ padding: "4px" }}
          />
        </Box>
        {!allFieldsChecked && (
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
        {allFieldsChecked && (
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
