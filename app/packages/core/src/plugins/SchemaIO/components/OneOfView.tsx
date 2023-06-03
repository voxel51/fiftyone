import { Box, Tab, Tabs } from "@mui/material";
import React, { useState } from "react";
import { HeaderView } from ".";
import DynamicIO from "./DynamicIO";
import HelpTooltip from "./HelpTooltip";
import { getComponentProps } from "../utils";

export default function OneOfView(props) {
  const { schema, path, onChange, data, errors } = props;
  const { types, view } = schema;
  const { oneof = [] } = view;
  const [tab, setTab] = useState(0);

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <Tabs
        value={tab}
        onChange={(e, tab) => {
          setTab(tab);
          onChange(path, undefined);
        }}
        variant="scrollable"
        scrollButtons={false}
        sx={{ borderBottom: 1, borderColor: "divider" }}
        {...getComponentProps(props, "tabs")}
      >
        {types.map((type, i) => {
          const label = oneof[i]?.label || `${view?.label} type ${i}`;
          const description = oneof[i]?.description;
          return (
            <Tab
              key={`${path}-${i}-tab`}
              value={i}
              label={label}
              icon={description && <HelpTooltip title={description} />}
              iconPosition="end"
              sx={{ minHeight: 48 }}
              {...getComponentProps(props, "tab")}
            />
          );
        })}
      </Tabs>
      <Box sx={{ p: 1 }} {...getComponentProps(props, "tabContainer")}>
        <DynamicIO
          {...props}
          key={`${path}-${tab}-content`}
          schema={types[tab]}
        />
      </Box>
    </Box>
  );
}
