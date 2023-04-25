import { Box, Tab, Tabs } from "@mui/material";
import React, { useState } from "react";
import Header from "./Header";
import HelpTooltip from "./HelpTooltip";
import DynamicIO from "./DynamicIO";

export default function OneOfView(props) {
  const { schema, path, onChange, data, errors } = props;
  const { types, view } = schema;
  const { oneof = [] } = view;
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Header {...view} />
      <Tabs
        value={tab}
        onChange={(e, tab) => {
          setTab(tab);
          onChange(path, undefined);
        }}
        variant="scrollable"
        scrollButtons={false}
        sx={{ borderBottom: 1, borderColor: "divider" }}
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
            />
          );
        })}
      </Tabs>
      <Box sx={{ p: 1 }}>
        <DynamicIO
          key={`${path}-${tab}-content`}
          schema={types[tab]}
          onChange={onChange}
          path={path}
          data={data} // todo: need to support selecting oneof matching data
          errors={errors}
        />
      </Box>
    </Box>
  );
}
