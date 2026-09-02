/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What the App shows with no session to connect to: how to start one.
 */

import { Header } from "@fiftyone/components";
import { isNotebook } from "@fiftyone/state";
import {
  Align,
  Button,
  Heading,
  HeadingLevel,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useState } from "react";
import { useRecoilValue } from "recoil";

import HeaderLinks from "./HeaderLinks";
import styles from "./Setup.module.css";

const port = (() => {
  if (typeof window !== "undefined" && window.location.port !== undefined) {
    return Number.parseInt(window.location.port);
  }
  return "";
})();

const remoteSnippet = `import fiftyone as fo

# Load your FiftyOne dataset
dataset = fo.load_dataset(...)

# Launch a remote App instance that you'll connect to from your local machine
session = fo.launch_app(dataset, remote=True, port=XXXX)
`;

const Code = ({ children }: { children: string }) => (
  <pre className={styles.code}>{children}</pre>
);

const LocalInstructions = () => {
  const localSnippet = `import fiftyone as fo

# Load your FiftyOne dataset
dataset = fo.load_dataset(...)

# Launch the app
session = fo.launch_app(dataset, port=${port})
`;
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
      <Heading level={HeadingLevel.H2}>Local sessions</Heading>
      <Text color={TextColor.Secondary}>
        Here&apos;s how to connect to a local session from Python:
      </Text>
      <Code>{localSnippet}</Code>
    </Stack>
  );
};

const RemoteInstructions = () => {
  const bashSnippet = `# Option 1: Configure port forwarding
# Then open http://localhost:${port} in your web browser
ssh -N -L ${port}:127.0.0.1:XXXX [<username>@]<hostname>

# Option 2: Use the CLI
fiftyone app connect --destination [<username>@]<hostname> \\
    --port XXXX --local-port ${port}
`;
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
      <Heading level={HeadingLevel.H2}>Remote sessions</Heading>
      <Text color={TextColor.Secondary}>
        You can work with data on a remote machine by launching a remote App
        session and connecting to it from your local machine. See{" "}
        <a
          target="_blank"
          href="https://docs.voxel51.com/user_guide/app.html#remote-sessions"
          rel="noreferrer"
        >
          this page
        </a>{" "}
        for more information.
      </Text>
      <Heading level={HeadingLevel.H3}>On your remote machine</Heading>
      <Code>{remoteSnippet}</Code>
      <Heading level={HeadingLevel.H3}>On your local machine</Heading>
      <Code>{bashSnippet}</Code>
    </Stack>
  );
};

const NotebookInstructions = () => (
  <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
    <Heading level={HeadingLevel.H2}>Notebook sessions</Heading>
    <Text color={TextColor.Secondary}>
      Re-run the cell that created the session shown here.
    </Text>
  </Stack>
);

const TABS = [
  { id: "local", label: "Local sessions" },
  { id: "remote", label: "Remote sessions" },
] as const;

const Setup = () => {
  const [activeTab, setActiveTab] = useState<"local" | "remote">("local");
  const notebook = useRecoilValue(isNotebook);

  return (
    <div data-cy="setup-page">
      <Header title={"FiftyOne"}>
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          justify={Justify.End}
          spacing={Spacing.Sm}
          className={styles.links}
        >
          <HeaderLinks />
        </Stack>
      </Header>
      <div className={styles.page}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Sm}
          className={styles.content}
        >
          <Heading level={HeadingLevel.H1}>Welcome to FiftyOne!</Heading>
          <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
            It looks like you are not connected to a session
          </Text>
          {notebook ? (
            <NotebookInstructions />
          ) : (
            <>
              <Stack
                orientation={Orientation.Row}
                spacing={Spacing.Sm}
                className={styles.tabs}
              >
                {TABS.map(({ id, label }) => (
                  <Button
                    key={id}
                    variant={
                      activeTab === id ? Variant.Primary : Variant.Secondary
                    }
                    size={Size.Md}
                    aria-pressed={activeTab === id}
                    onClick={() => setActiveTab(id)}
                  >
                    {label}
                  </Button>
                ))}
              </Stack>
              {activeTab === "remote" ? (
                <RemoteInstructions />
              ) : (
                <LocalInstructions />
              )}
            </>
          )}
        </Stack>
      </div>
    </div>
  );
};

export default Setup;
