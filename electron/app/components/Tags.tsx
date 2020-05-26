import React, { useState } from "react";
import { Menu, Dimmer, Loader, Container, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

const Tags = (props) => {
  const { port, activeTags, setActiveTags, colors, start, lengths } = props;
  const socket = getSocket(port, "state");

  const onClick = (t) => {
    setActiveTags({ ...activeTags, [t]: !Boolean(activeTags[t]) });
  };

  let content;
  if (lengths.tags && lengths.tags.length) {
    const { tags } = lengths;
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
    content = <pre className="pre-tag">None</pre>;
  }
  return <>{content}</>;
};

export default connect(Tags);
