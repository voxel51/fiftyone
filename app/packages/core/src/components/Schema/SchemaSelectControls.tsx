import React from "react";
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

  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{ position: "relative !important" }}
    >
      <Box display="flex" width="100%" flexDirection="row" marginTop="1rem">
        <ContainerBox>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  defaultChecked={false}
                  value={showMetadata}
                  checked={showMetadata}
                  onChange={() => setShowMetadata(!showMetadata)}
                  disabled={isFilterRuleMode && !searchResults.length}
                />
              }
              label="Show metadata"
            />
          </FormGroup>
        </ContainerBox>
        {isFilterRuleMode && (
          <ContainerBox>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    defaultChecked={true}
                    value={includeNestedFields}
                    checked={includeNestedFields}
                    onChange={() =>
                      setIncludeNestedFields(!includeNestedFields)
                    }
                    disabled={!searchResults.length}
                  />
                }
                label="Include nested fields"
              />
            </FormGroup>
          </ContainerBox>
        )}
        {!isFilterRuleMode && (
          <ContainerBox>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    defaultChecked={false}
                    value={showNestedFields}
                    checked={showNestedFields}
                    onChange={() => setShowNestedFields(!showNestedFields)}
                  />
                }
                label="Show nested fields"
              />
            </FormGroup>
          </ContainerBox>
        )}
        {!isFilterRuleMode && (
          <ContainerBox>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    defaultChecked
                    value={allFieldsChecked}
                    checked={allFieldsChecked}
                    onChange={() => setAllFieldsChecked(!allFieldsChecked)}
                  />
                }
                label="Select all"
              />
            </FormGroup>
          </ContainerBox>
        )}
      </Box>
    </Box>
  );
};
