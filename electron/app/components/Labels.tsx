import React, { useState } from "react";
import { Dimmer, Loader, Container, Label } from "semantic-ui-react";
import _ from "lodash";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

const reserved = ["_id", "metadata", "filepath"];

const Labels = (props) => {
  const {
    labelData,
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
  if (labelData.labels && labelData.labels.length) {
    let labels = labelData.labels.sort((a, b) =>
      a._id.field > b._id.field ? 1 : -1
    );
    const styles = (t, i) => {
      if (activeLabels[t]) {
        return { background: colors[i] };
      }
      return { borderColor: colors[i] };
    };
    let cnt = 0;
    content = (
      <>
        {labels.map((l, i) => {
          if (
            ((l._id.cls === "Classification" || l._id.cls === "Detections") &&
              !other) ||
            (!l._id.cls && other && _.indexOf(reserved, l._id.field) < 0)
          ) {
            cnt += 1;
            return (
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
            );
          } else {
            return null;
          }
        })}
      </>
    );
    if (cnt === 0) {
      content = <pre className="pre-tag">None</pre>;
    }
  } else {
    content = <pre className="pre-tag">None</pre>;
  }
  return <>{content}</>;
};

export default connect(Labels);
