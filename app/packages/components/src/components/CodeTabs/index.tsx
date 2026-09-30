import { Orientation, Spacing, Stack, Tab, Tabs } from "@voxel51/voodo";
import { useState } from "react";
import CodeBlock, { type CodeBlockProps } from "../CodeBlock";

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

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function CodeTabs({ tabs, selected, onChange }: CodeTabsProps) {
  const [tab, setTab] = useState(tabs[0].id);
  const computedTab = selected || tab;
  const active = tabs.find(({ id }) => id === computedTab);

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Tabs aria-label={computedTab}>
        {tabs.map(({ label, id }) => (
          <Tab
            key={id}
            active={id === computedTab}
            onClick={() => {
              setTab(id);
              onChange?.(id);
            }}
          >
            {label}
          </Tab>
        ))}
      </Tabs>
      {active && <CodeBlock {...active} text={active.code} />}
    </Stack>
  );
}
