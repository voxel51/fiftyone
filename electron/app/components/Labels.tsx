import React, { useState } from "react";
import { Dimmer, Loader, Container, Label } from "semantic-ui-react";
import _ from "lodash";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

const reserved = ["_id", "metadata", "filepath"];

const Labels = (props) => {
  const {
    lengths,
    port,
    activeLabels,
    setActiveLabels,
    other,
    colors,
    start,
  } = props;
  const socket = getSocket(port, "state");
  const onClick = (l) => {
    setActiveLabels({ ...activeLabels, [l]: !Boolean(activeLabels[l]) });
  };

  const isFloat = (n) => {
    return Number(n) === n && n % 1 !== 0;
  };

  let content;
  if (lengths.labels && lengths.labels.length) {
    const { labels } = lengths;
    const styles = (t, i) => {
      if (activeLabels[t]) {
        return { background: colors[lengths.mapping[t]] };
      }
      return { borderColor: colors[lengths.mapping[t]] };
    };
    content = (
      <Container>
        {labels.map((l, i) =>
          (l._id.cls === "Classification" && !other) ||
          (!l._id.cls && other && _.indexOf(reserved, l._id.field) < 0) ? (
            <div
              className={`tag clickable ${
                activeLabels[l._id.field] ? "active" : ""
              }`}
              key={i}
              onClick={() => onClick(l._id.field)}
              style={styles(l._id.field, i)}
            >
              {l._id.field}
            </div>
          ) : null
        )}
      </Container>
    );
  } else {
    content = <pre className="pre-tag">None</pre>;
  }
  return <>{content}</>;
};

export default connect(Labels);
