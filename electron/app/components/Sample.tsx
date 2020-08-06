import React from "react";
import { useRecoilValue } from "recoil";

import { updateState } from "../actions/update";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";
import { isFloat } from "../utils/generic";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import * as selectors from "../recoil/selectors";
import { VALID_LABEL_TYPES, VALID_SCALAR_TYPES } from "../utils/labels";

const Sample = ({
  displayProps,
  dispatch,
  sample,
  port,
  setSelected,
  selected,
  setView,
}) => {
  const host = `http://127.0.0.1:${port}`;
  const id = sample._id.$oid;
  const src = `${host}?path=${sample.filepath}&id=${id}`;
  const socket = getSocket(port, "state");
  const s = sample;
  const { activeLabels, activeTags, activeOther, colors } = displayProps;
  const colorMapping = useRecoilValue(selectors.labelColorMapping);
  const tagNames = useRecoilValue(selectors.tagNames);

  const handleClick = () => {
    const newSelected = { ...selected };
    const event = newSelected[id] ? "remove_selection" : "add_selection";
    newSelected[id] = newSelected[id] ? false : true;
    setSelected(newSelected);
    socket.emit(event, id, (data) => {
      dispatch(updateState(data));
    });
  };
  const eventHandlers = {
    onClick: () => handleClick(),
    onDoubleClick: () => setView({ visible: true, sample }),
  };
  const renderLabel = (name) => {
    const label = sample[name];
    if (
      !activeLabels[name] ||
      !label ||
      !label._cls ||
      !(
        VALID_LABEL_TYPES.includes(label._cls) ||
        VALID_SCALAR_TYPES.includes(label._cls)
      )
    ) {
      return null;
    }
    let value = undefined;
    for (const prop of ["label", "value"]) {
      if (label.hasOwnProperty(prop)) {
        value = label[prop];
        break;
      }
    }
    if (value === undefined) {
      return null;
    }
    if (typeof value == "number") {
      value = Number(value.toFixed(3));
    }
    return (
      <Tag key={"label-" + name} name={value} color={colorMapping[name]} />
    );
  };

  return (
    <div className="sample">
      <Player51
        src={src}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
        }}
        colors={colors}
        sample={sample}
        thumbnail={true}
        activeLabels={activeLabels}
        {...eventHandlers}
      />
      <div className="sample-info" {...eventHandlers}>
        {Object.keys(sample).sort().map(renderLabel)}
        {tagNames.map((t) => {
          return activeTags[t] ? (
            <Tag key={t} name={String(t)} color={colorMapping[t]} />
          ) : null;
        })}
      </div>
      {selected[id] ? (
        <div
          style={{
            border: "2px solid rgb(255, 109, 4)",
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
          }}
        />
      ) : null}
    </div>
  );
};

export default connect(Sample);
