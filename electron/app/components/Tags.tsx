import React, { useState } from "react";
import { Dimmer, Loader, Container, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

const Tags = (props) => {
  const { port } = props;
  const socket = getSocket(port, "state");
  const [renderingState, setRenderingState] = useState({
    initialLoad: true,
    loading: true,
    tags: null,
  });
  const { initialLoad, loading, tags } = renderingState;
  let content;
  if (initialLoad) {
    socket.emit("tags", "", (data) => {
      setRenderingState({ ...renderingState, initialLoad: false, tags: data });
    });
    content = (
      <Dimmer active>
        <Loader>Loading</Loader>
      </Dimmer>
    );
  } else if (tags.length) {
    content = (
      <Container>
        {tags.map((t, i) => (
          <div className="tag" key={i}>
            {t}
          </div>
        ))}
      </Container>
    );
  } else {
    content = <>No tags</>;
  }
  return <>{content}</>;
};

export default connect(Tags);
