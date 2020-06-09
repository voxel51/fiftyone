import React from "react";
import { Container } from "semantic-ui-react";

import connect from "../utils/connect";

const Tags = (props) => {
  const { activeTags, setActiveTags, colors, displayData } = props;

  const onClick = (t) => {
    setActiveTags({
      ...activeTags,
      [t.name]: typeof activeTags[t.name] !== "string" ? colors[t.color] : null,
    });
  };
  const { tags } = displayData;
  let content;
  if (tags) {
    const styles = (t) => {
      if (activeTags[t.name]) {
        return { background: colors[t.color] };
      }
      return { borderColor: colors[t.color] };
    };
    content = (
      <Container>
        {tags.map((t, i) => (
          <div
            className={`tag clickable ${activeTags[t.name] ? "active" : ""}`}
            key={i}
            onClick={() => onClick(t)}
            style={styles(t)}
          >
            {t.name}
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
