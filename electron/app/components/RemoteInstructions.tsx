import React from "react";
import { Header, Divider } from "semantic-ui-react";

import CodeBlock from "./CodeBlock";
import bashSnippet from "../snippets/remote.bash";
import pySnippet from "../snippets/remote.py";

export default () => (
  <>
    <Header as="h3">Remote sessions</Header>
    <Divider />
    <p>
      If you would like to connect to a remote session, you'll have to configure
      port forwarding on your local machine.
    </p>
    <Header as="h4">On your remote machine</Header>
    <Divider />
    <CodeBlock language="python">{pySnippet}</CodeBlock>
    <Header as="h4">On your local machine</Header>
    <Divider />
    <CodeBlock language="bash">{bashSnippet}</CodeBlock>

    <Header as="h4">Port configuration</Header>
    <Divider />
    <p>
      The default FiftyOne port is <code>5151</code>. You can configure at
      anytime using the settings tab.
    </p>
  </>
);
