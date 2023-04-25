import React from "react";
import { Box } from "@mui/material";

interface Props {
  searchTerm?: string;
  setSearchTerm: (value: string) => void;
}

export const SchemaSearch = (props: Props) => {
  const { searchTerm, setSearchTerm } = props;

  return (
    <Box style={{ display: "flex", position: "relative" }}>
      <input
        value={searchTerm}
        placeholder="search by fields and attributes"
        style={{ color: "#232323", width: "100%" }}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </Box>
  );
};
