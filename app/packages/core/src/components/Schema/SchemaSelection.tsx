import React, { useCallback, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { CodeBlock, JSONIcon, useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";
import { SchemaSelectionControls } from "./SchemaSelectControls";
import { SchemaSearchHelp } from "./SchemaSearchHelp";
import { ExpandMore } from "@mui/icons-material";
import styled from "styled-components";
import { EMBEDDED_DOCUMENT_FIELD } from "@fiftyone/utilities";

const InfoCell = styled(Box)`
  display: flex;
  padding: 0 0.25rem;
`;

const MetaInfoBlock = styled(Box)`
  display: flex;
  padding-left: 2rem;
  font-size: 0.9rem;
  color: ${({ theme }) => theme.text.secondary};
`;
const MetaInfoKey = styled(Typography)`
  color: ${({ theme }) => theme.text.secondary};
  padding-right: 0.25rem;
  font-weight: bold !important;
  font-size: 1rem;
`;

export const SchemaSelection = () => {
  const theme = useTheme();
  const {
    toggleSelection,
    finalSchema,
    searchResults,
    isFilterRuleActive,
    showMetadata,
    finalSchemaKeyByPath,
  } = useSchemaSettings();
  const [expandedPaths, setExpandedPaths] = useState({});
  const showSearchHelp = isFilterRuleActive && !searchResults?.length;
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
            const value = Number.isInteger(fInfo) ? fInfo : fInfo.toFixed(3);
            return <MetaInfoBlock key={path + value}>{value}</MetaInfoBlock>;
          case "string":
            return (
              <MetaInfoBlock key={fInfo}>
                {fInfo.length ? fInfo : '""'}
              </MetaInfoBlock>
            );
          case "boolean":
            const boolLabel: string = fInfo ? "True" : "False";
            <MetaInfoBlock key={path + boolLabel}>{boolLabel}</MetaInfoBlock>;
          case "object":
            try {
              const obj = fInfo;
              if (Array.isArray(obj)) {
                return obj.map((key) => {
                  return <InfoCell key={key}>{key}</InfoCell>;
                });
              } else {
                return Object.keys(obj).map((key) => {
                  const val = obj[key] || "";
                  return (
                    <MetaInfoBlock key={path + key}>
                      <MetaInfoKey>
                        {`${key}:`}
                        {` `}
                      </MetaInfoKey>
                      {JSONifiedPaths.has(path)
                        ? JSON.stringify(val, null, 1)
                        : JSON.stringify(val)}
                    </MetaInfoBlock>
                  );
                });
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
        }}
      >
        {showSearchHelp && <SchemaSearchHelp />}
        {showSelection &&
          finalSchema?.map(
            ({ path, count, isSelected, pathLabelFinal, skip, disabled }) => {
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
                    <Box display="flex" flexDirection="row" width="100%">
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
                      <Box display="flex">
                        <Box
                          style={{
                            paddingLeft: `${
                              isFilterRuleActive
                                ? "0.5rem"
                                : `${(count - 1) * 15 + 5}px`
                            }`,
                            color: disabled
                              ? theme.text.tertiary
                              : theme.text.primary,
                            fontSize: "1rem",
                          }}
                          display="flex"
                        >
                          {pathLabelFinal}
                        </Box>
                        <Box
                          display="flex"
                          style={{
                            paddingLeft: "0.5rem",
                            color: disabled
                              ? theme.text.tertiary
                              : theme.text.secondary,
                            fontSize: "0.8rem",
                            alignItems: "center",
                          }}
                        >
                          ({docTypeLabel})
                        </Box>
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
                      <Box
                        maxHeight="200px"
                        overflow="auto"
                        position="relative"
                      >
                        {renderInfo(fInfo, path)}
                        {fDesc && (
                          <MetaInfoBlock key={fDesc}>
                            <MetaInfoKey>Description: </MetaInfoKey>
                            {fDesc}
                          </MetaInfoBlock>
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
            }
          )}
      </Box>
    </Box>
  );
};
