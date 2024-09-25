import { Box, CodeBlock } from '@fiftyone/teams-components';
import { Tab, Tabs, Typography } from '@mui/material';
import { CSSProperties, useMemo, useState } from 'react';
import { CodeBlockProps } from '../CodeBlock';

type CodeTab = Omit<CodeBlockProps, 'text'> & {
  id: string;
  code: string;
  label: string;
  customStyle?: CSSProperties;
};

type CodeTabsProps = {
  tabs: Array<CodeTab>;
  selected?: string;
  onChange?: (tabId: string) => void;
  description?: string;
};

export default function CodeTabs(props: CodeTabsProps) {
  const { tabs, selected, onChange, description } = props;
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
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={computedTab}
          onChange={(e, value) => {
            setTab(value);
            if (typeof onChange === 'function') onChange(value);
          }}
          aria-label={computedTab}
          sx={{ padding: 0 }}
        >
          {tabs.map(({ label, id }) => (
            <Tab
              key={id}
              label={label}
              value={id}
              sx={{ padding: 0, alignItems: 'center' }}
            />
          ))}
        </Tabs>
      </Box>
      {Boolean(description) && <Typography py={2}>{description}</Typography>}
      <Box mt={1} sx={{ cursor: 'pointer' }}>
        <CodeBlock {...tabProps} text={tabProps.code} />
      </Box>
    </Box>
  );
}
