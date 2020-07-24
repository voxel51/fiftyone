import React, { useState } from "react";
import { Container } from "semantic-ui-react";

import connect from "../utils/connect";

const Tags = (props) => {
  const { activeTags, setActiveTags, colors, start, lengths } = props;

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
