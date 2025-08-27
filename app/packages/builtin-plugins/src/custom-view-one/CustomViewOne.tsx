import { Stack, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import One from "./One";
import Two from "./Two";
import Three from "./Three";
import Four from "./Four";

export default function CustomViewOne(props) {
  const [tab, setTab] = useState("one");

  return (
    <Stack>
      <Tabs value={tab} onChange={(event, newValue) => setTab(newValue)}>
        <Tab label="Example One" value="one" />
        <Tab label="Example Two" value="two" />
        <Tab label="Example Three" value="three" />
        <Tab label="Example Four" value="four" />
      </Tabs>
      {tab === "one" && <One {...props} />}
      {tab === "two" && <Two {...props} />}
      {tab === "three" && <Three {...props} />}
      {tab === "four" && <Four {...props} />}
    </Stack>
  );
}
