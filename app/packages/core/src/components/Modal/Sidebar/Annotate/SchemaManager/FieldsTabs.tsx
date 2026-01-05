import { Tab, Tabs } from "@mui/material";
import { useAtom } from "jotai";
import React from "react";
import { activeSchemaTab } from "../state";
import { editTabsStyles } from "./styled";

const FieldsTabs = () => {
  const [tab, setTab] = useAtom(activeSchemaTab);
  return (
    <Tabs
      value={tab}
      sx={editTabsStyles}
      TabIndicatorProps={{
        style: { display: "none" },
      }}
    >
      <Tab label="GUI" value="gui" onClick={() => setTab("gui")} />
      <Tab label="JSON" value="json" onClick={() => setTab("json")} />
    </Tabs>
  );
};

export default FieldsTabs;
