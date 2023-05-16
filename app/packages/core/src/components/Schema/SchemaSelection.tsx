import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { CodeBlock, useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";
import { SchemaSelectionControls } from "./SchemaSelectControls";
import { SchemaSearchHelp } from "./SchemaSearchHelp";
import { ExpandMore } from "@mui/icons-material";
import { TAB_OPTIONS_MAP } from "@fiftyone/state/src/hooks/useSchemaSettings";
import styled from "styled-components";

interface Props {}

const InfoCell = styled(Box)`
  display: flex;
  border-bottom: ${({ theme }) => `1px solid ${theme.background.border}`};
`;

export const SchemaSelection = () => {
  const theme = useTheme();
  const {
    toggleSelection,
    finalSchema,
    searchResults,
    selectedTab,
    showMetadata,
    finalSchemaKeyByPath,
  } = useSchemaSettings();
  const isFilterRuleMode = selectedTab === TAB_OPTIONS_MAP.FILTER_RULE;
  const [expandedPaths, setEpandedPaths] = useState({});
  const showSearchHelp = isFilterRuleMode && !searchResults?.length;
  const showSelection = !showSearchHelp;
  const expandedPathsKeys = new Set(Object.keys(expandedPaths));

  useEffect(() => {
    if (showMetadata) {
      const res = {};
      finalSchema?.forEach((entry) => {
        if (entry?.info || entry?.description) {
          res[entry.path] = entry;
        }
      });
      setEpandedPaths(res);
    } else {
      setEpandedPaths({});
    }
  }, [showMetadata]);

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
          height: "45vh",
          marginTop: "1rem",
          overflow: "auto",
          color: "#232323",
          border: `1px solid ${theme.primary.plainBorder}`,
        }}
      >
        {showSearchHelp && <SchemaSearchHelp />}
        {showSelection &&
          finalSchema?.map((item) => {
            const { path, count, isSelected, pathLabelFinal, skip, disabled } =
              item;

            if (skip) return null;

            const field = finalSchemaKeyByPath[path];
            const fInfo = field?.info;
            const fDesc = field?.description;
            const isExpandable = fInfo || fDesc;

            return (
              <Box
                style={{
                  padding: "0.25rem 0.25rem",
                  borderBottom: `1px solid ${theme.primary.plainBorder}`,
                  display: "flex",
                  flexDirection: "column",
                  background:
                    theme.mode === "light"
                      ? theme.background.level2
                      : theme.background.body,
                }}
                key={path}
              >
                <Box display="flex" justifyContent="space-between">
                  <Box display="flex" flexDirection="row">
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
                        paddingLeft: `${
                          isFilterRuleMode
                            ? "0.5rem"
                            : `${(count - 1) * 15 + 5}px`
                        }`,
                        color: disabled
                          ? theme.text.tertiary
                          : theme.text.primary,
                      }}
                    >
                      {pathLabelFinal}
                    </Box>
                  </Box>
                  {isExpandable && (
                    <Box
                      display="flex"
                      alignItems="center"
                      sx={{ cursor: "pointer" }}
                      onClick={() => {
                        if (expandedPathsKeys.has(path)) {
                          const newPaths = Object.assign({}, expandedPaths);
                          delete newPaths[path];
                          setEpandedPaths(newPaths);
                        } else {
                          const newPaths = Object.assign({}, expandedPaths);
                          const element = finalSchema.filter(
                            (sc) => sc.path === path
                          )?.[0];

                          newPaths[path] = {
                            info: element?.info || "None",
                            description: element?.description || "None",
                            name: element?.name || "None",
                          };
                          setEpandedPaths(newPaths);
                        }
                      }}
                    >
                      <ExpandMore />
                    </Box>
                  )}
                </Box>
                <Box>
                  {expandedPathsKeys.has(path) && (
                    <Box maxHeight="200px" overflow="auto">
                      {fInfo && (
                        <InfoCell>info: {JSON.stringify(fInfo || "")}</InfoCell>
                      )}
                      {fDesc && (
                        <CodeBlock
                          showLineNumbers={false}
                          text={`description: ${fDesc}`}
                          fontSize={12}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
      </Box>
    </Box>
  );
};
