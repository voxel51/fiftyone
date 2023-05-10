import React, { useState } from "react";
import * as foq from "@fiftyone/relay";
import { Box, Typography } from "@mui/material";
import { Tooltip, useTheme } from "@fiftyone/components";
import { SchemaSelection } from "./SchemaSelection";
import { useMutation } from "react-relay";
import { noneAtom, useSchemaSettings } from "@fiftyone/state";
import { Clear, ClearAll } from "@mui/icons-material";

interface Props {
  searchTerm?: string;
  setSearchTerm: (value: string) => void;
}

export const SchemaSearch = (props: Props) => {
  const { searchTerm, setSearchTerm } = props;
  const theme = useTheme();
  const [searchSchemaFields, isSearchingSchemaFields] =
    useMutation<foq.searchSelectFieldsMutation>(foq.searchSelectFields);
  const [error, setError] = useState<string>("");

  const { setSearchResults, dataset } = useSchemaSettings();

  return (
    <Box
      style={{
        display: "flex",
        position: "relative",
        flexDirection: "column",
        marginTop: "1rem",
      }}
    >
      <Box width="100%" paddingTop="0.5rem">
        <input
          value={searchTerm}
          placeholder="search by fields and attributes"
          style={{
            color: theme.text.secondary,
            width: "100%",
            border: `1px solid ${theme.divider}`,
            padding: "0.5rem 0.75rem",
            background: theme.background.level1,
            outline: "none",
          }}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dataset) {
              if (searchTerm) {
                // convert dot notation to object
                const split = searchTerm.split(":");
                let checkValue = split?.[1] || "";
                let finalSearchTerm = checkValue
                  ? searchTerm.substring(0, searchTerm.indexOf(":"))
                  : searchTerm;
                finalSearchTerm = finalSearchTerm.trim();
                checkValue = checkValue.trim();

                let props = finalSearchTerm.split(".");
                const last = props[props.length - 1];
                let object = {};
                let ref = object;
                if (checkValue && props.length > 0) {
                  props.forEach((prop, index) => {
                    if (index === props.length - 1) {
                      ref[prop] = checkValue;
                    } else {
                      ref[prop] = {};
                    }
                    ref = ref[prop];
                  });
                  props[last] = checkValue;
                } else {
                  // string
                  object = finalSearchTerm;
                }

                searchSchemaFields({
                  variables: { datasetName: dataset.name, metaFilter: object },
                  onCompleted: (data, err) => {
                    if (data) {
                      const { searchSelectFields = [] } = data;
                      setSearchResults(
                        searchSelectFields.map((ss) => ss?.path) as string[]
                      );
                    }
                  },
                  onError: (e) => {
                    setError("Failed to find fields matching your search");
                  },
                });
              } else {
                setSearchResults([]);
              }
              setError("");
            }
          }}
        />
        <Tooltip text="Hit Enter to see results!" placement="bottom-center">
          <Box
            style={{
              zIndex: 1600,
              display: "flex",
              position: "absolute",
              right: "33px",
              top: "16px",
              background: theme.background.level2,
              padding: "1px 4px",
              borderRadius: "4px",
            }}
          >
            <Typography
              variant="body1"
              component="span"
              sx={{ color: theme.text.tertiary }}
            >
              Enter &crarr;
            </Typography>
          </Box>
        </Tooltip>
        <Box
          sx={{
            zIndex: "9999",
            display: "flex",
            position: "absolute",
            right: "3px",
            top: "17px",
            padding: "1px 4px",
            cursor: "pointer",
            opacity: searchTerm ? 1 : 0.3,
            background: theme.background.level1,
            borderRadius: "50%",

            "&:hover": {
              background: theme.background.level2,
            },
          }}
          onClick={() => {
            setSearchResults([]);
            setSearchTerm("");
            setError("");
          }}
        >
          <Clear />
        </Box>
        {error && <Box sx={{ color: theme.danger[600] }}>{error}</Box>}
      </Box>
      <Box width="100%">
        <SchemaSelection />
      </Box>
    </Box>
  );
};
