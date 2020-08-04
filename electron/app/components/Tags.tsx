import React, { useState } from "react";
import { Container } from "semantic-ui-react";

import connect from "../utils/connect";

const Tags = (props) => {
  const { activeTags, setActiveTags, colors, start, labelData } = props;

  const onClick = (t) => {
    setActiveTags({ ...activeTags, [t]: !Boolean(activeTags[t]) });
  };

  let content;
  if (labelData.tags && labelData.tags.length) {
    const { tags } = labelData;
    const styles = (t, i) => {
      if (activeTags[t]) {
        return { background: colors[labelData.colorMapping[t]] };
      }
      return { borderColor: colors[labelData.colorMapping[t]] };
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
