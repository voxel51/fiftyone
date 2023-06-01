import React, { useCallback, useEffect, useState } from "react";
import { Box } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { CodeBlock, JSONIcon, useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";
import { SchemaSelectionControls } from "./SchemaSelectControls";
import { SchemaSearchHelp } from "./SchemaSearchHelp";
import { ExpandMore } from "@mui/icons-material";
import { TAB_OPTIONS_MAP } from "@fiftyone/state/src/hooks/useSchemaSettings";
import styled from "styled-components";

interface Props {}

const InfoCell = styled(Box)`
  display: flex;
  padding: 0 0.25rem;
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
  const [expandedPaths, setExpandedPaths] = useState({});
  const showSearchHelp = isFilterRuleMode && !searchResults?.length;
  const showSelection = !showSearchHelp;
  const expandedPathsKeys = new Set(Object.keys(expandedPaths));
  const [JSONifiedPaths, setJSONifiedPaths] = useState(new Set());

  useEffect(() => {
    if (showMetadata) {
      const res = {};
      finalSchema?.forEach((entry) => {
        if (entry?.info || entry?.description) {
          res[entry.path] = entry;
        }
      });
      setExpandedPaths(res);
    } else {
      setExpandedPaths({});
    }
  }, [showMetadata]);

  const renderInfo = useCallback(
    (fInfo, path: string) => {
      if (fInfo) {
        switch (typeof fInfo) {
          case "number":
            return (
              <CodeBlock
                showLineNumbers={false}
                text={Number.isInteger(fInfo) ? fInfo : fInfo.toFixed(3)}
                fontSize={12}
                key={fInfo}
              />
            );
          case "string":
            return (
              <CodeBlock
                showLineNumbers={false}
                text={fInfo.length ? fInfo : '""'}
                fontSize={12}
                key={fInfo}
              />
            );
          case "boolean":
            <CodeBlock
              showLineNumbers={false}
              text={fInfo ? "True" : "False"}
              fontSize={12}
              key={`${fInfo}`}
            />;
          case "object":
            try {
              const obj = fInfo;
              if (Array.isArray(obj)) {
                return obj.map((key) => {
                  return <InfoCell key={key}>{key}</InfoCell>;
                });
              } else {
                const res = Object.keys(obj)
                  .map((key) => {
                    const val = obj[key] || "";
                    return `${key}: ${
                      JSONifiedPaths.has(path)
                        ? JSON.stringify(val, null, 1)
                        : JSON.stringify(val)
                    }`;
                  })
                  .join("\n");
                return (
                  <CodeBlock
                    showLineNumbers={false}
                    text={res}
                    fontSize={12}
                    key={`${fInfo}`}
                  />
                );
              }
            } catch (e) {
              return <InfoCell>{fInfo}</InfoCell>;
            }
          default:
            return <InfoCell>None</InfoCell>;
        }
      }
    },
    [JSONifiedPaths]
  );

  const handleJSONify = useCallback(
    (path: string) => {
      const newJSONifiedPaths = new Set([...JSONifiedPaths]);
      if (JSONifiedPaths.has(path)) {
        newJSONifiedPaths.delete(path);
      } else {
        newJSONifiedPaths.add(path);
      }
      setJSONifiedPaths(newJSONifiedPaths);
    },
    [JSONifiedPaths]
  );

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
                  position: "relative",
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
                      position="relative"
                      alignItems="center"
                      sx={{ cursor: "pointer" }}
                      onClick={() => {
                        if (expandedPathsKeys.has(path)) {
                          const newPaths = Object.assign({}, expandedPaths);
                          delete newPaths[path];
                          setExpandedPaths(newPaths);
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
                          setExpandedPaths(newPaths);
                        }
                      }}
                    >
                      <ExpandMore />
                    </Box>
                  )}
                </Box>
                <Box>
                  {expandedPathsKeys.has(path) && (
                    <Box maxHeight="200px" overflow="auto" position="relative">
                      {renderInfo(fInfo, path)}
                      {fDesc && (
                        <CodeBlock
                          showLineNumbers={false}
                          text={`description: ${fDesc}`}
                          fontSize={12}
                        />
                      )}
                      <Box
                        sx={{
                          position: "absolute",
                          right: "0.5rem",
                          bottom: "20%",
                          cursor: "pointer",
                        }}
                        onClick={() => handleJSONify(path)}
                      >
                        <JSONIcon
                          sx={{
                            color: (theme) => theme.typography.body2,
                            fontSize: "1rem",
                          }}
                        />
                      </Box>
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
