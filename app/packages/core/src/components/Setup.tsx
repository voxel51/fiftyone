import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "@react-spring/web";

import { scrollbarStyles } from "../components/utils";
import { isElectron } from "@fiftyone/utilities";
import {
  DocsLink,
  GitHubLink,
  Header,
  iconContainer,
  SlackLink,
  useTheme,
} from "@fiftyone/components";
import { useRecoilValue } from "recoil";
import { isNotebook } from "@fiftyone/state";

const SectionTitle = styled.div`
  font-size: 2rem;
  line-height: 3rem;
  color: ${({ theme }) => theme.font};
  font-weight: bold;
`;

const Text = styled.p`
  font-size: 1rem;
  line-height: 1.5rem;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.fontDark};

  & > a {
    color: ${({ theme }) => theme.brand};
  }
`;

const Code = styled.pre`
  padding: 2rem;
  background-color: ${({ theme }) => theme.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  color: ${({ theme }) => theme.font};
  border-radius: 3px;
  overflow: auto;

  ${scrollbarStyles}
`;

const port = (() => {
  if (isElectron()) {
    return parseInt(process.env.FIFTYONE_SERVER_PORT) || 5151;
  }

  if (window.location.port !== undefined) {
    return parseInt(window.location.port);
  }
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
      <Text>Here's how to connect to a local session from Python:</Text>
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
          href="https://voxel51.com/docs/fiftyone/user_guide/app.html#remote-sessions"
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
  background: ${({ theme }) => theme.backgroundDark};
  border-top: 1px solid ${({ theme }) => theme.backgroundDarkBorder};

  ${scrollbarStyles};
`;

const SetupContainer = styled.div`
  width: 80%;
  padding: 3rem 1rem;
  margin: 0 auto;
`;

const Title = styled.div`
  font-size: 2.5rem;
  line-height: 3.5rem;
  color: ${({ theme }) => theme.font};
  font-weight: bold;
`;

const Subtitle = styled.div`
  font-size: 1.5rem;
  color: ${({ theme }) => theme.fontDark};
  font-weight: 500;
`;

const TabsContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  margin: 1em 0 3em 0;
  border-bottom-width: 2px;
  border-bottom-style: solid;
  border-bottom-color: ${({ theme }) => theme.backgroundDarkBorder};
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
      activeTab === "local" ? theme.brand : theme.backgroundDark,
    color: activeTab === "local" ? theme.font : theme.fontDark,
  });
  const remoteProps = useSpring({
    borderBottomColor:
      activeTab === "remote" ? theme.brand : theme.backgroundDark,
    color: activeTab === "remote" ? theme.font : theme.fontDark,
  });
  const notebook = useRecoilValue(isNotebook);

  return (
    <>
      <Header title={"FiftyOne"}>
        <div className={iconContainer} style={{ flex: 1 }}>
          <SlackLink />
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
    </>
  );
};

export default Setup;
