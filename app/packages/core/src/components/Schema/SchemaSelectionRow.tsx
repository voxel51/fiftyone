import React, { useCallback } from "react";
import { Box, Typography } from "@mui/material";

import Checkbox from "@mui/material/Checkbox";
import { useTheme } from "@fiftyone/components";
import { useSchemaSettings } from "@fiftyone/state";
import { ExpandMore } from "@mui/icons-material";
import styled from "styled-components";

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

const MAX_ROW_HEIGHT = "200px";

interface Props {
  path: string;
  isSelected: boolean;
  count: number;
  disabled: boolean;
  pathLabelFinal: string;
  docTypeLabel: string;
  isExpandable: boolean;
  info: any;
  description: string;
}

export const SchemaSelectionRow = (props: Props) => {
  const {
    path,
    isSelected,
    count,
    disabled,
    pathLabelFinal,
    docTypeLabel,
    isExpandable,
    info,
    description,
  } = props;
  const theme = useTheme();
  const {
    toggleSelection,
    finalSchema,
    isFilterRuleActive,
    expandedPaths = {},
    setExpandedPaths,
  } = useSchemaSettings();
  const expandedPathsKeys = new Set(Object.keys(expandedPaths || {}));

  const renderInfo = useCallback(() => {
    if (info) {
      const infoType = typeof info;
      if (infoType === "number") {
        const value = Number.isInteger(info) ? info : info.toFixed(3);
        return <MetaInfoBlock key={path + value}>{value}</MetaInfoBlock>;
      }
      if (infoType === "string") {
        return (
          <MetaInfoBlock key={info}>{info.length ? info : '""'}</MetaInfoBlock>
        );
      }
      if (infoType === "boolean") {
        const boolLabel: string = info ? "True" : "False";
        return (
          <MetaInfoBlock key={path + boolLabel}>{boolLabel}</MetaInfoBlock>
        );
      }
      if (infoType === "object") {
        try {
          const obj = info;
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
                  {JSON.stringify(val)}
                </MetaInfoBlock>
              );
            });
          }
        } catch (e) {
          return <InfoCell>{info}</InfoCell>;
        }
      }
      return <InfoCell>None</InfoCell>;
    }
  }, [info, path]);

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
              data-cy={`schema-selection-${path}`}
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
                  isFilterRuleActive ? "0.5rem" : `${(count - 1) * 15 + 5}px`
                }`,
                color: disabled ? theme.text.tertiary : theme.text.primary,
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
                color: disabled ? theme.text.tertiary : theme.text.tertiary,
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
              if (expandedPathsKeys && expandedPathsKeys.has(path)) {
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
            maxHeight={MAX_ROW_HEIGHT}
            overflow="auto"
            position="relative"
            data-cy={`schema-selection-info-container-${path}`}
          >
            {renderInfo()}
            {description && (
              <MetaInfoBlock key={description}>
                <MetaInfoKey>Description: </MetaInfoKey>
                {description}
              </MetaInfoBlock>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
