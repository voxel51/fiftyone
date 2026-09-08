import { HelpTooltip } from "@fiftyone/components";
import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";
import DynamicIO from "./DynamicIO";

export default function OneOfView(props) {
  const { schema, path, onChange } = props;
  const { types, view } = schema;
  const { oneof = [] } = view;
  const [tab, setTab] = useState(0);

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <Tabs
        value={tab}
        onChange={(_e, tab) => {
          setTab(tab);
          onChange(path, undefined);
        }}
        variant="scrollable"
        scrollButtons={false}
        sx={{ borderBottom: 1, borderColor: "divider" }}
        {...getComponentProps(props, "tabs")}
      >
        {types.map((_type, i) => {
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
