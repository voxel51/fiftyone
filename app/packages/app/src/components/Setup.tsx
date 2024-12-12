import {
  DocsLink,
  GitHubLink,
  Header,
  DiscordLink,
  iconContainer,
  useTheme,
} from "@fiftyone/components";
import { isNotebook } from "@fiftyone/state";
import { styles } from "@fiftyone/utilities";
import { animated, useSpring } from "@react-spring/web";
import React, { useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

const SectionTitle = styled.div`
  font-size: 2rem;
  line-height: 3rem;
  color: ${({ theme }) => theme.text.primary};
  font-weight: bold;
`;

const Text = styled.p`
  font-size: 1rem;
  line-height: 1.5rem;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.text.secondary};

  & > a {
    color: ${({ theme }) => theme.primary.plainColor};
  }
`;

const Code = styled.pre`
  padding: 2rem;
  background-color: ${({ theme }) => theme.background.level3};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  color: ${({ theme }) => theme.text.primary};
  border-radius: 3px;
  overflow: auto;

  ${styles.scrollbarStyles}
`;

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

const LocalInstructions = () => {
  const localSnippet = `import fiftyone as fo

# Load your FiftyOne dataset
dataset = fo.load_dataset(...)

# Launch the app
session = fo.launch_app(dataset, port=${port})
`;
  return (
    <>
      <SectionTitle>Local sessions</SectionTitle>
      <Text>Here&apos;s how to connect to a local session from Python:</Text>
      <Code>{localSnippet}</Code>
    </>
  );
};

const RemoteInstructions = () => {
  const bashSnippet = `# Option 1: Configure port forwaring
# Then open http://localhost:${port} in your web browser
ssh -N -L ${port}:127.0.0.1:XXXX [<username>@]<hostname>

# Option 2: Use the CLI
fiftyone app connect --destination [<username>@]<hostname> \\
    --port XXXX --local-port ${port}
`;
  return (
    <>
      <SectionTitle>Remote sessions</SectionTitle>
      <Text>
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
      <Subtitle>On your remote machine</Subtitle>
      <Code>{remoteSnippet}</Code>
      <Subtitle>On your local machine</Subtitle>
      <Code>{bashSnippet}</Code>
    </>
  );
};

const NotebookInstructions = () => {
  return (
    <>
      <SectionTitle>Notebook sessions</SectionTitle>
      <Text>Re-run the cell that created the session shown here.</Text>
    </>
  );
};

const SetupWrapper = styled.div`
  width: 100%;
  overflow: auto;
  background: ${({ theme }) => theme.background.level2};
  border-top: 1px solid ${({ theme }) => theme.primary.plainBorder};

  ${styles.scrollbarStyles}
`;

const SetupContainer = styled.div`
  width: 80%;
  padding: 3rem 1rem;
  margin: 0 auto;
`;

const Title = styled.div`
  font-size: 2.5rem;
  line-height: 3.5rem;
  color: ${({ theme }) => theme.text.primary};
  font-weight: bold;
`;

const Subtitle = styled.div`
  font-size: 1.5rem;
  color: ${({ theme }) => theme.text.secondary};
  font-weight: 500;
`;

const TabsContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  margin: 1em 0 3em 0;
  border-bottom-width: 2px;
  border-bottom-style: solid;
  border-bottom-color: ${({ theme }) => theme.primary.plainBorder};
  height: 53px;
`;

const Tab = animated(styled.div`
  font-size: 1rem;
  line-height: 3em;
  font-weight: bold;
  padding: 0 0.5em;
  cursor: pointer;
  border-bottom-width: 3px;
  border-bottom-style: solid;
`);

const Setup = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<string>("local");
  const localProps = useSpring({
    borderBottomColor:
      activeTab === "local"
        ? theme.primary.plainColor
        : theme.background.level2,
    color: activeTab === "local" ? theme.text.primary : theme.text.secondary,
  });
  const remoteProps = useSpring({
    borderBottomColor:
      activeTab === "remote"
        ? theme.primary.plainColor
        : theme.background.level2,
    color: activeTab === "remote" ? theme.text.primary : theme.text.secondary,
  });
  const notebook = useRecoilValue(isNotebook);

  return (
    <div data-cy="setup-page">
      <Header title={"FiftyOne"}>
        <div className={iconContainer} style={{ flex: 1 }}>
          <DiscordLink />
          <GitHubLink />
          <DocsLink />
        </div>
      </Header>
      <SetupWrapper>
        <SetupContainer>
          <Title>Welcome to FiftyOne!</Title>
          <Subtitle>It looks like you are not connected to a session</Subtitle>
          {notebook ? (
            <NotebookInstructions />
          ) : (
            <>
              <TabsContainer>
                <Tab onClick={() => setActiveTab("local")} style={localProps}>
                  Local sessions
                </Tab>
                <Tab onClick={() => setActiveTab("remote")} style={remoteProps}>
                  Remote sessions
                </Tab>
              </TabsContainer>
              {activeTab === "remote" ? (
                <RemoteInstructions />
              ) : (
                <LocalInstructions />
              )}
            </>
          )}
        </SetupContainer>
      </SetupWrapper>
    </div>
  );
};

export default Setup;
