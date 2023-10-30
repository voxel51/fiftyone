import React from "react";
import { Box, Typography } from "@mui/material";

import { CodeBlock, useTheme } from "@fiftyone/components";

interface Props {}

interface Example {
  title: string;
  code?: string;
  primaryTextColor?: boolean;
}
const EXAMPLES = [
  {
    primaryTextColor: true,
    title: "Examples:",
  },
  {
    title:
      'Search across name, description, and all info.* keys for string "foo"',
    code: "foo",
  },
  {
    title: 'Match fields whose name contains "ground_truth"',
    code: "name:ground_truth",
  },
  {
    title: "Match fields whose owner contains “foo”",
    code: "owner:foo",
  },
  {
    title: 'Match fields whose description contains "foo"',
    code: "description:foo",
  },
  // {
  //   title: "# Match fields whose info.created_at is less than YYYY-MM-DD",
  //   code: "info.created_at:<2022-11-10",
  // },
] as Example[];

export const SchemaSearchHelp = (props: Props) => {
  const theme = useTheme();

  return (
    <Box display="flex" flexDirection="column" data-cy="filter-rule-container">
      {EXAMPLES.map(({ title, primaryTextColor, code }: Example) => (
        <Box
          key={title}
          width="100%"
          display="flex"
          flexDirection="column"
          padding="0.5rem 0"
        >
          <Typography
            variant="body1"
            component="span"
            sx={{
              color: primaryTextColor
                ? theme.text.primary
                : theme.text.secondary,
            }}
          >
            {title}
          </Typography>
          {code && (
            <Box paddingTop="0.25rem">
              <CodeBlock
                text={code}
                language="python"
                showLineNumbers={false}
              />
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};
