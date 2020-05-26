import React, { useState } from "react";
import { Dimmer, Loader, Container, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

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
  const [renderingState, setRenderingState] = useState({
    initialLoad: true,
    loading: true,
    labels: null,
  });
  const { initialLoad, loading, labels } = renderingState;
  const onClick = (l) => {
    setActiveLabels({ ...activeLabels, [l]: !Boolean(activeLabels[l]) });
  };

  const isFloat = (n) => {
    return Number(n) === n && n % 1 !== 0;
  };

  let content;
  if (initialLoad) {
    socket.emit("labels", "", (data) => {
      const fields = [];
      for (const i in data) {
        if (data[i]._id.cls === "Classification" && !other) {
          fields.push(data[i]._id.field);
        } else if (!data[i]._id.cls && other) {
          if (["metadata", "filepath", "_id"].indexOf(data[i]._id.field) >= 0)
            continue;
          fields.push(data[i]._id.field);
        }
      }
      setRenderingState({
        ...renderingState,
        initialLoad: false,
        labels: fields,
      });
    });
    content = (
      <Dimmer active>
        <Loader>Loading</Loader>
      </Dimmer>
    );
  } else if (labels.length) {
    const styles = (t, i) => {
      if (activeLabels[t]) {
        return { background: colors[lengths.mapping[t]] };
      }
      return { borderColor: colors[lengths.mapping[t]] };
    };
    content = (
      <Container>
        {labels.map((l, i) => (
          <div
            className={`tag clickable ${activeLabels[l] ? "active" : ""}`}
            key={i}
            onClick={() => onClick(l)}
            style={styles(l, i)}
          >
            {isFloat(l) ? l.toFixed(3) : l}
          </div>
        ))}
      </Container>
    );
  } else {
    content = <pre class="pre-tag">None</pre>;
  }
  return <>{content}</>;
};

export default connect(Labels);
