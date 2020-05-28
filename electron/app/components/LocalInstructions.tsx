import React from "react";
import { Header, Divider } from "semantic-ui-react";

import CodeBlock from "./CodeBlock";
import pySnippet from "../snippets/local.py";

export default () => (
  <>
    <Header as="h3">Local sessions</Header>
    <Divider />
    <p>
      The following demonstrates how to connect to a local session from a python
      shell.
    </p>
    <CodeBlock language="python">{pySnippet}</CodeBlock>
  </>
);
