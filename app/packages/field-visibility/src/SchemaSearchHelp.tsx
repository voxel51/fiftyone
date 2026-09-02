/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The filter-rule examples shown before a rule returns results.
 */

import { CodeBlock } from "@fiftyone/components";
import {
  Orientation,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";

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
] as Example[];

export const SchemaSearchHelp = () => {
  return (
    <Stack data-cy="filter-rule-container" orientation={Orientation.Column}>
      {EXAMPLES.map(({ title, primaryTextColor, code }: Example) => (
        <Stack
          key={title}
          orientation={Orientation.Column}
          style={{ width: "100%", padding: "0.5rem 0" }}
        >
          <Text
            variant={TextVariant.Md}
            color={primaryTextColor ? TextColor.Primary : TextColor.Secondary}
          >
            {title}
          </Text>
          {code && (
            <div style={{ paddingTop: "0.25rem" }}>
              <CodeBlock
                text={code}
                language="python"
                showLineNumbers={false}
              />
            </div>
          )}
        </Stack>
      ))}
    </Stack>
  );
};
