import React from "react";
import * as foq from "@fiftyone/relay";
import get from "lodash/get";
import { Box } from "@mui/material";
import { useTheme } from "@fiftyone/components";
import { SchemaSelection } from "./SchemaSelection";
import { useMutation } from "react-relay";
import { useRecoilState } from "recoil";
import { useSchemaSettings } from "@fiftyone/state";

interface Props {
  searchTerm?: string;
  setSearchTerm: (value: string) => void;
}

export const SchemaSearch = (props: Props) => {
  const { searchTerm, setSearchTerm } = props;
  const theme = useTheme();
  const [searchSchemaFields, isSearchingSchemaFields] =
    useMutation<foq.searchSelectFieldsMutation>(foq.searchSelectFields);

  const { searchResults, setSearchResults } = useSchemaSettings();

  return (
    <Box
      style={{ display: "flex", position: "relative", flexDirection: "column" }}
    >
      <Box width="100%" paddingTop="0.5rem">
        <input
          value={searchTerm}
          placeholder="search by fields and attributes"
          style={{
            color: theme.text.secondary,
            width: "100%",
            border: `1px solid ${theme.primary.plainBorder}`,
            padding: "0.5rem 0.75rem",
          }}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (searchTerm) {
                // convert dot notation to object
                const split = searchTerm.split(":");
                let checkValue = split?.[1] || "";
                let finalSearchTerm = checkValue
                  ? searchTerm.substring(0, searchTerm.indexOf(":"))
                  : searchTerm;
                finalSearchTerm = finalSearchTerm.replace(/\s/g, "");
                checkValue = checkValue.replace(/\s/g, "");

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
                  variables: { metaFilter: object },
                  onCompleted: (data, err) => {
                    if (data) {
                      const { searchSelectFields = [] } = data;
                      setSearchResults(
                        searchSelectFields.map((ss) => ss?.path) as string[]
                      );
                    }
                    if (err?.length) {
                      console.error(err);
                      // TODO: show feedback
                    }
                  },
                  // onerror
                });
              }
            }
          }}
        />
      </Box>
      <Box width="100%">
        <SchemaSelection mode="search" />
      </Box>
    </Box>
  );
};
