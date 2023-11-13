import React from "react";
import { CodeBlock } from "@fiftyone/components";
import { Box, Tab, Tabs } from "@mui/material";
import { useMemo, useState } from "react";
import { CodeBlockProps } from "../CodeBlock";

type CodeTab = Omit<CodeBlockProps, "text"> & {
  id: string;
  code: string;
  label: string;
};

type CodeTabsProps = {
  tabs: Array<CodeTab>;
  selected?: string;
  onChange?: (tabId: string) => void;
};

export default function CodeTabs(props: CodeTabsProps) {
  const { tabs, selected, onChange } = props;
  const [tab, setTab] = useState(tabs[0].id);

  const tabsById = useMemo(
    () =>
      tabs.reduce((currentTabsById, tab) => {
        currentTabsById[tab.id] = tab;
        return currentTabsById;
      }, {}),
    [tabs]
  );
  const computedTab = selected || tab;
  const tabProps = tabsById?.[computedTab] || {};

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={computedTab}
          onChange={(e, value) => {
            setTab(value);
            if (typeof onChange === "function") onChange(value);
          }}
          aria-label={computedTab}
          sx={{ padding: 0 }}
        >
          {tabs.map(({ label, id }) => (
            <Tab
              key={id}
              label={label}
              value={id}
              sx={{ padding: 0, alignItems: "center" }}
            />
          ))}
        </Tabs>
      </Box>
      <Box mt={1} sx={{ cursor: "pointer" }}>
        <CodeBlock {...tabProps} text={tabProps.code} />
      </Box>
    </Box>
  );
}
