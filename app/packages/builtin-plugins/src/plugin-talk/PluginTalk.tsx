import { usePanelStatePartial } from "@fiftyone/spaces";
import { Stack, Tab, Tabs } from "@mui/material";
import Four from "./Four";
import One from "./One";
import Three from "./Three";
import Two from "./Two";

export default function PluginTalk(props) {
  const [tab, setTab] = usePanelStatePartial("tab", "one");

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
