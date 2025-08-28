import { Stack, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import One from "./One";
import Two from "./Two";
import Three from "./Three";

export default function CustomViewOne(props) {
  const [tab, setTab] = useState("one");

  return (
    <Stack>
      <Tabs value={tab} onChange={(event, newValue) => setTab(newValue)}>
        <Tab label="Example One" value="one" />
        <Tab label="Example Two" value="two" />
        <Tab label="Example Three" value="three" />
      </Tabs>
      {tab === "one" && <One {...props} />}
      {tab === "two" && <Two {...props} />}
      {tab === "three" && <Three {...props} />}
    </Stack>
  );
}
