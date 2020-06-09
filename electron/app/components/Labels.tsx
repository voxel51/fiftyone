import React, { useEffect } from "react";
import _ from "lodash";

import connect from "../utils/connect";

const reserved = ["_id", "metadata", "filepath"];

const Labels = (props) => {
  const { displayData, activeLabels, setActiveLabels, scalars, colors } = props;
  const onClick = (l) => {
    setActiveLabels({
      ...activeLabels,
      [l.field]:
        typeof activeLabels[l.field] !== "string" ? colors[l.color] : null,
    });
  };

  let content;
  if (displayData.labels.length) {
    const styles = (l) => {
      if (activeLabels[l.field]) {
        return { background: colors[l.color] };
      }
      return { borderColor: colors[l.color] };
    };
    let cnt = 0;
    content = (
      <>
        {displayData.labels.map((l, i) => {
          if (
            ((l.cls === "Classification" || l.cls === "Detections") &&
              !scalars) ||
            (!l.cls && scalars && _.indexOf(reserved, l.field) < 0)
          ) {
            cnt += 1;
            return (
              <div
                className={`tag clickable ${
                  activeLabels[l.field] ? "active" : ""
                }`}
                key={i}
                onClick={() => onClick(l)}
                style={styles(l)}
              >
                {l.field}
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
