import React from "react";
import { Box } from "@mui/material";

import { CodeBlock, useTheme } from "@fiftyone/components";
import { SchemaSelection } from "./SchemaSelection";

interface Props {
  searchTerm?: string;
  setSearchTerm: (value: string) => void;
}

export const SchemaSearch = (props: Props) => {
  const { searchTerm, setSearchTerm } = props;
  const theme = useTheme();

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
        />
      </Box>
      <Box width="100%">
        <SchemaSelection mode="search" />
      </Box>
    </Box>
  );
};
