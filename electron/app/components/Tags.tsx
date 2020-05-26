import React, { useState } from "react";
import { Menu, Dimmer, Loader, Container, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

const Tags = (props) => {
  const { port, activeTags, setActiveTags, colors, start, lengths } = props;
  const socket = getSocket(port, "state");
  const [renderingState, setRenderingState] = useState({
    initialLoad: true,
    loading: true,
    tags: null,
  });
  const { initialLoad, loading, tags } = renderingState;

  const onClick = (t) => {
    setActiveTags({ ...activeTags, [t]: !Boolean(activeTags[t]) });
  };

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
    const styles = (t, i) => {
      if (activeTags[t]) {
        return { background: colors[lengths.mapping[t]] };
      }
      return { borderColor: colors[lengths.mapping[t]] };
    };
    content = (
      <Container>
        {tags.map((t, i) => (
          <div
            className={`tag clickable ${activeTags[t] ? "active" : ""}`}
            key={i}
            onClick={() => onClick(t)}
            style={styles(t, i)}
          >
            {t}
          </div>
        ))}
      </Container>
    );
  } else {
    content = <pre class="pre-tag">None</pre>;
  }
  return <>{content}</>;
};

export default connect(Tags);
