import React, { useEffect, useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import Header from "./Header";
import HelpTooltip from "./HelpTooltip";
import RoundedTabs from "./RoundedTabs";

export default function TabsView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {}, default: defaultValue } = schema;
  const { choices = [], variant = "default" } = view;
  const [tab, setTab] = useState(data ?? (defaultValue || choices[0]?.value));

  useEffect(() => {
    if (typeof onChange === "function") onChange(path, tab);
  }, [tab]);

  return (
    <Box>
      <Header {...view} />
      {variant === "rounded" && (
        <RoundedTabs
          tabs={choices.map((choice) => ({ id: choice.value, ...choice }))}
          selected={tab}
          onChange={setTab}
        />
      )}
      {variant !== "rounded" && (
        <Tabs
          value={tab}
          variant="scrollable"
          scrollButtons="auto"
          onChange={(e, value) => setTab(value)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          {choices.map(({ value, label, description }) => (
            <Tab
              key={value}
              label={label}
              value={value}
              icon={description && <HelpTooltip title={description} />}
              iconPosition="end"
              sx={{ minHeight: 48 }}
            />
          ))}
        </Tabs>
      )}
    </Box>
  );
}
