import React from "react";
import Box from "@mui/material/Box";

import {
  DatasetSort,
  SearchDatasets,
  MediaTypeSelection,
  UserRadioSelection,
} from "@fiftyone/teams-components";

export default function DatasetListFilterBar() {
  return (
    <Box
      paddingTop={2}
      paddingBottom={2}
      display="flex"
      flexDirection="row"
      justifyContent="space-between"
    >
      <Box display="flex" alignItems="center">
        <SearchDatasets />
        <MediaTypeSelection />
        <UserRadioSelection />
      </Box>
      <DatasetSort />
    </Box>
  );
}
