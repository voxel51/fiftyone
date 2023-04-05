import React, { useState } from "react";
import { Box, Tabs, Tab, Typography } from "@mui/material";
import Header from "./Header";
import Tooltip from "./Tooltip";

export default function OneOf(props) {
  const { view } = props.schema;
  const { oneOffs } = view;
  const [tab, setTab] = useState(oneOffs[0].id);

  return (
    <Box>
      <Header {...view} />
      <Tabs
        value={tab}
        onChange={(e, tab) => setTab(tab)}
        variant="scrollable"
        scrollButtons={false}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        {oneOffs.map(({ id, label, description }) => (
          <Tab
            key={id}
            value={id}
            label={label}
            disableRipple
            icon={description && <Tooltip title={description} />}
            iconPosition="end"
            sx={{ minHeight: 48 }}
          />
        ))}
      </Tabs>
      <Box sx={{ p: 1 }}>{tab}</Box>
    </Box>
  );
}
