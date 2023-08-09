import { Box, Tab, Tabs } from "@mui/material";
import React, { useEffect, useState } from "react";
import HeaderView from "./HeaderView";
import HelpTooltip from "./HelpTooltip";
import RoundedTabs from "./RoundedTabs";
import { getComponentProps } from "../utils";

export default function TabsView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {}, default: defaultValue } = schema;
  const { choices = [], variant = "default" } = view;
  const [tab, setTab] = useState(data ?? (defaultValue || choices[0]?.value));

  useEffect(() => {
    if (typeof onChange === "function") onChange(path, tab);
  }, [tab]);

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
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
          {...getComponentProps(props, "tabs")}
        >
          {choices.map(({ value, label, description }) => (
            <Tab
              key={value}
              label={label}
              value={value}
              icon={description && <HelpTooltip title={description} />}
              iconPosition="end"
              sx={{ minHeight: 48 }}
              {...getComponentProps(props, "tab")}
            />
          ))}
        </Tabs>
      )}
    </Box>
  );
}
