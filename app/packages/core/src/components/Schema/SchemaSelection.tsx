import React from "react";
import { Box } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { useTheme, Button } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";

interface Props {}

export const SchemaSelection = (props: Props) => {
  const theme = useTheme();
  const {
    setSettingsModal,
    setSearchTerm,
    finalSelectedPaths,
    originalSelectedPaths,
    setSelectedPaths,
    fieldsOnly,
    setFieldsOnly,
    setView,
    toggleSelection,
    finalSchema,
    allFieldsChecked,
    setAllFieldsChecked,
  } = useSchemaSettings();

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ position: "relative !important" }}
    >
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
        {finalSchema.map((item) => {
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
      <Box
        style={{
          position: "relative",
          display: "flex",
          padding: "1rem 0.25rem",
        }}
      >
        <Button
          style={{
            color: theme.text.primary,
            marginRight: "0.5rem",
            boxShadow: "none",
            padding: "0.5rem 0.5rem",
            borderRadius: "4px",
          }}
          onClick={() => {
            const stageKwargs = [
              ["field_names", [...finalSelectedPaths]],
              ["_allow_missing", true],
            ];
            const stageCls = "fiftyone.core.stages.SelectFields";
            const stage = {
              _cls: stageCls,
              kwargs: stageKwargs,
            } as Stage;
            try {
              setView([stage]);
            } catch (e) {
              console.log("error", e);
            } finally {
              setSettingsModal({ open: false });
            }
          }}
        >
          Add to view
        </Button>
        <Button
          style={{
            color: theme.text.primary,
            boxShadow: "none",
            padding: "0.5rem 0.5rem",
            borderRadius: "4px",
          }}
          onClick={() => {
            setSettingsModal({ open: false });
            setSearchTerm("");
            setSelectedPaths(originalSelectedPaths);
          }}
        >
          cancel
        </Button>
      </Box>
    </Box>
  );
};
