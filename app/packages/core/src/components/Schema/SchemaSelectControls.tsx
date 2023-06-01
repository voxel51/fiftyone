import React, { useMemo } from "react";
import { Box, FormControlLabel, FormGroup, Switch } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";
import { TAB_OPTIONS_MAP } from "@fiftyone/state/src/hooks/useSchemaSettings";
import styled from "styled-components";

const ContainerBox = styled(Box)`
  position: relative;
  display: flex;
  color: ${({ theme }) => theme.text.primary};
  box-shadow: ${({ theme }) => `0px 1px 2px ${theme.divider}`};
  padding: 0.35rem 1rem;
`;

interface Props {}

export const SchemaSelectionControls = (props: Props) => {
  const theme = useTheme();
  const {
    showNestedFields,
    setShowNestedFields,
    allFieldsChecked,
    setAllFieldsChecked,
    selectedTab,
    showMetadata,
    setShowMetadata,
    searchResults,
    includeNestedFields,
    setIncludeNestedFields,
  } = useSchemaSettings();
  const isFilterRuleMode = selectedTab === TAB_OPTIONS_MAP.FILTER_RULE;
  const showMetadataVisibile = !!!(isFilterRuleMode && !searchResults.length);
  const includeNestedVisible = !!(isFilterRuleMode && searchResults.length);

  const controlList = useMemo(() => {
    return [
      {
        label: "Show metadata",
        isVisible: showMetadataVisibile,
        value: showMetadata,
        checked: showMetadata,
        onChange: () => setShowMetadata(!showMetadata),
      },
      {
        label: "Include nested fields",
        isVisible: includeNestedVisible,
        value: includeNestedFields,
        checked: includeNestedFields,
        onChange: () => setIncludeNestedFields(!includeNestedFields),
        disabled: !searchResults.length,
      },
      {
        label: "Show nested fields",
        isVisible: !isFilterRuleMode,
        value: showNestedFields,
        checked: showNestedFields,
        onChange: () => setShowNestedFields(!showNestedFields),
      },
      {
        label: "Select all",
        isVisible: !isFilterRuleMode,
        value: allFieldsChecked,
        checked: allFieldsChecked,
        onChange: () => setAllFieldsChecked(!allFieldsChecked),
      },
    ];
  }, [
    showMetadata,
    showMetadataVisibile,
    includeNestedFields,
    showNestedFields,
    allFieldsChecked,
  ]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ position: "relative !important" }}
    >
      <Box display="flex" width="100%" flexDirection="row" marginTop="1rem">
        {controlList
          .filter(({ isVisible }) => isVisible)
          .map(({ label, value, checked, onChange, disabled = false }) => (
            <ContainerBox key={label}>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      value={value}
                      checked={checked}
                      onChange={onChange}
                      disabled={disabled}
                    />
                  }
                  label={label}
                  sx={{ letterSpacing: "0.05rem" }}
                />
              </FormGroup>
            </ContainerBox>
          ))}
      </Box>
    </Box>
  );
};
