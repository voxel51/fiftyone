import React, { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import TabPanel from "./TabPanel";
import Console from "./Console";
import Plugins from "./Plugins";
import Panels from "./Panels";

const FiftyOnePanel = () => {
  const [value, setValue] = useState(0);
  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Tabs
        value={value}
        onChange={handleChange}
        aria-label="FiftyOne panel tabs"
      >
        <Tab label="Console" />
        <Tab label="Plugins" />
        <Tab label="Panels" />
      </Tabs>
      <TabPanel value={value} index={0}>
        <Console />
      </TabPanel>
      <TabPanel value={value} index={1}>
        <Plugins />
      </TabPanel>
      <TabPanel value={value} index={2}>
        <Panels />
      </TabPanel>
    </Box>
  );
};

export default FiftyOnePanel;
