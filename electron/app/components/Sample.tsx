import React from "react";
import { useRecoilValue } from "recoil";

import { updateState } from "../actions/update";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";
import { isFloat } from "../utils/generic";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import * as selectors from "../recoil/selectors";
import { getLabelText, stringify } from "../utils/labels";

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
  const { activeLabels, activeTags, activeOther } = displayProps;
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
    if (!activeLabels[name] || !label) {
      return null;
    }
    let value = getLabelText(label);
    if (value === undefined) {
      return null;
    }
    return (
      <Tag
        key={"label-" + name}
        title={name}
        name={value}
        color={colorMapping[name]}
      />
    );
  };
  const renderScalar = (name) => {
    if (
      !activeOther[name] ||
      sample[name] === undefined ||
      sample[name] === null
    ) {
      return null;
    }
    return (
      <Tag
        key={"scalar-" + name}
        title={name}
        name={stringify(sample[name])}
        color={colorMapping[name]}
      />
    );
  };
  const tooltip = `Path: ${sample.filepath}\nDouble-click for details`;

  return (
    <div className="sample" title={tooltip}>
      <Player51
        src={src}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
        }}
        colorMapping={colorMapping}
        sample={sample}
        thumbnail={true}
        activeLabels={activeLabels}
        {...eventHandlers}
      />
      <div className="sample-info" {...eventHandlers}>
        {Object.keys(sample).sort().map(renderLabel)}
        {sample.tags.sort().map((t) => {
          return activeTags[t] ? (
            <Tag key={t} name={String(t)} color={colorMapping[t]} />
          ) : null;
        })}
        {Object.keys(sample).sort().map(renderScalar)}
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
