import { Tab, Tabs } from "@mui/material";
import { useAtom } from "jotai";
import React from "react";
import { activeSchemaTab } from "../state";

const tabsStyles = {
  minHeight: 36,

  "& .MuiTabs-flexContainer": {
    height: 36,
    width: "100%",
    display: "flex",
    "& > *": {
      flex: 1,
    },
  },
  "& .MuiTab-root": {
    minHeight: 36,
    height: 36,
    padding: "7px 16px",
    minWidth: "unset",
    lineHeight: "20px",
    textTransform: "none",
    border: "1px solid",
    borderColor: (theme) => theme.palette.divider,
    borderRight: "none",
    whiteSpace: "nowrap",
    "&:first-of-type": {
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
    },
    "&:last-of-type": {
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      borderRight: "1px solid",
      borderColor: (theme) => theme.palette.divider,
    },
    "&.Mui-selected": {
      color: (theme) => theme.palette.text.primary,
      backgroundColor: (theme) => theme.palette.background.button,
    },
  },
};

const FieldsTabs = () => {
  const [tab, setTab] = useAtom(activeSchemaTab);
  return (
    <Tabs
      value={tab}
      sx={tabsStyles}
      TabIndicatorProps={{
        style: { display: "none" },
      }}
    >
      <Tab
        label="Active schema"
        value="active"
        onClick={() => setTab("active")}
      />
      <Tab label="Other fields" value="other" onClick={() => setTab("other")} />
    </Tabs>
  );
};

export default FieldsTabs;
