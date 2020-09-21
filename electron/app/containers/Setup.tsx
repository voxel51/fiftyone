import React, { useState, useContext } from "react";
import { Redirect } from "react-router-dom";
import styled, { ThemeContext } from "styled-components";
import { animated, useSpring } from "react-spring";

import routes from "../constants/routes.json";
import connect from "../utils/connect";
import localSnippet from "../snippets/local.py";
import bashSnippet from "../snippets/remote.bash";
import remoteSnippet from "../snippets/remote.py";

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
`;

const Code = styled.pre`
  padding: 2rem;
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  color: ${({ theme }) => theme.font};
  border-radius: 3px;
`;

const LocalInstructions = () => (
  <>
    <SectionTitle>Local sessions</SectionTitle>
    <Text>
      The following demonstrates how to connect to a local session from a python
      shell.
    </Text>
    <Code>{localSnippet}</Code>
  </>
);

const RemoteInstructions = () => (
  <>
    <SectionTitle>Remote sessions</SectionTitle>
    <Text>
      If you would like to connect to a remote session, you'll have to configure
      port forwarding on your local machine.
    </Text>
    <Subtitle>On your remote machine</Subtitle>
    <Code>{remoteSnippet}</Code>
    <Subtitle>On your local machine</Subtitle>
    <Code>{bashSnippet}</Code>

    <Subtitle>Port configuration</Subtitle>
    <Text>
      The default FiftyOne port is <code>5151</code>. You can configure at
      anytime using the settings tab.
    </Text>
  </>
);

const SetupContainer = styled.div`
  max-width: 800px;
  padding: 3rem 0;
  margin: auto;
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

function Setup(props) {
  const { connected } = props;
  const theme = useContext(ThemeContext);
  const [activeTab, setActiveTab] = useState<string>("local");
  const localProps = useSpring({
    borderBottomColor: activeTab === "local" ? theme.brand : theme.background,
    color: activeTab === "local" ? theme.font : theme.fontDark,
  });
  const remoteProps = useSpring({
    borderBottomColor: activeTab === "remote" ? theme.brand : theme.background,
    color: activeTab === "remote" ? theme.font : theme.fontDark,
  });
  if (connected) {
    return <Redirect to={routes.DATASET} />;
  }

  return (
    <SetupContainer>
      <Title>Welcome to FiftyOne</Title>
      <Subtitle>It looks like you are not connected to a session</Subtitle>
      <TabsContainer>
        <Tab onClick={() => setActiveTab("local")} style={localProps}>
          Local sessions
        </Tab>
        <Tab onClick={() => setActiveTab("remote")} style={remoteProps}>
          Remote sessions
        </Tab>
      </TabsContainer>
      {activeTab === "remote" ? <RemoteInstructions /> : <LocalInstructions />}
    </SetupContainer>
  );
}

export default connect(Setup);
