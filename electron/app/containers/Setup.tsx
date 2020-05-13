import React, { createRef, useState } from "react";
import { Container, Header, Divider, Segment } from "semantic-ui-react";
import { Redirect } from "react-router-dom";

import routes from "../constants/routes.json";
import connect from "../utils/connect";
import CodeBlock from "../components/CodeBlock";
import PortForm from "../components/PortForm";

function Setup(props) {
  const { connected, port } = props;
  const [portFromForm, setPortFromForm] = useState(port);
  if (connected) {
    return <Redirect to={routes.DATASET} />;
  }
  return (
    <Segment>
      <Header as="h1">Hi there! Welcome to FiftyOne</Header>
      <Divider />
      <p>It looks like you are not connected to a session.</p>
      <Header as="h3">Local sessions</Header>
      <Divider />
      <p>
        The following demonstrates how to connect to a local session from a
        python shell.
      </p>
      <CodeBlock language="python">
        import fiftyone as fo
        <br />
        <br />
        session = fo.launch_dashboard() # you're connected!
      </CodeBlock>
      <Header as="h3">Remote sessions</Header>
      <Divider />
      <p>
        If you would like to connect to a remote session, you'll have to
        configure port forwarding on your local machine.
      </p>
      <CodeBlock language="bash">
        ssh -N -L 5151:127.0.0.1:5151 username@remote_session_ip
      </CodeBlock>

      <Header as="h3">Port configuration</Header>
      <Divider />
      <p>
        The default FiftyOne port is <code>5151</code>. You can configure at
        anytime using the settings tab.
      </p>
    </Segment>
  );
}

export default connect(Setup);
