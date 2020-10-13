import React, { useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import { animated, useSpring, useTransition } from "react-spring";

import { updateState } from "../actions/update";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { getLabelText, stringify } from "../utils/labels";
import { useFastRerender } from "../utils/hooks";

const SampleDiv = animated(styled.div`
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  background-color: ${({ theme }) => theme.backgroundLight};
`);

const LoadingBar = animated(styled.div`
  position: absolute;
  bottom: 0;
  left: 0px;
  width: auto;
  border-bottom-left-radius: 3px;
  border-bottom-right-radius: 3px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.brandFullyTransparent} 0%,
    ${({ theme }) => theme.brand} 50%,
    ${({ theme }) => theme.brandFullyTransparent} 100%
  );
  height: 0.2em;
`);

const useHoverLoad = (socket, sample, setVideoLabels, setFrameData) => {
  if (sample.media_type !== "video") {
    return [[], null, null];
  }
  const [barItem, setBarItem] = useState([]);
  const [requested, setRequested] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const onMouseEnter = !loaded
    ? (event) => {
        event.preventDefault();
        const {
          data: { player },
        } = event;
        if (requested) return;
        setRequested(true);
        setBarItem([0]);
        socket.emit("get_frame_labels", sample._id, ({ labels, frames }) => {
          setVideoLabels(labels);
          setFrameData(frames);
          setLoaded(true);
          setBarItem([]);
          player.updateOverlay(labels);
          if (player.isHovering()) player.play();
        });
      }
    : () => {};

  const onMouseLeave = !loaded ? () => setBarItem([]) : () => {};

  const bar = useTransition(barItem, (item) => item, {
    from: { right: "100%" },
    enter: {
      right: "0%",
    },
    leave: {
      right: "-100%",
    },
    onRest: (item) => {
      setBarItem(!loaded ? [item + 1] : []);
    },
  });

  return [bar, onMouseEnter, onMouseLeave];
};

const Sample = ({ dispatch, sample, metadata, port, setView }) => {
  const host = `http://127.0.0.1:${port}`;
  const id = sample._id;
  const src = `${host}?path=${sample.filepath}&id=${id}`;
  const socket = getSocket(port, "state");
  const filter = useRecoilValue(selectors.labelFilters);
  const colorMap = useRecoilValue(atoms.colorMap);
  const activeLabels = useRecoilValue(atoms.activeLabels);
  const activeTags = useRecoilValue(atoms.activeTags);
  const activeOther = useRecoilValue(atoms.activeOther);
  const setVideoLabels = useSetRecoilState(atoms.sampleVideoLabels(sample._id));
  const setFrameData = useSetRecoilState(atoms.sampleFrameData(sample._id));
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    atoms.selectedSamples
  );
  const rerender = useFastRerender();

  const handleClick = () => {
    const newSelected = new Set(selectedSamples);
    let event;
    if (newSelected.has(id)) {
      newSelected.delete(id);
      event = "remove_selection";
    } else {
      newSelected.add(id);
      event = "add_selection";
    }
    setSelectedSamples(newSelected);
    rerender();
    socket.emit(event, id, (data) => {
      dispatch(updateState(data));
    });
  };
  const eventHandlers = {
    onClick: () => handleClick(),
    onDoubleClick: () => setView(sample, metadata),
  };
  const renderLabel = ({ name, label, idx }) => {
    if (!activeLabels[name] || !label) {
      return null;
    }
    let value = getLabelText(label);
    if (value === undefined) {
      return null;
    }

    if (!filter[name](label)) {
      return null;
    }
    return (
      <Tag
        key={"label-" + name + "-" + value + (idx ? "-" + idx : "")}
        title={name}
        name={value}
        color={colorMap[name]}
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
        color={colorMap[name]}
      />
    );
  };
  const tooltip = `Double-click for details`;

  const showSamples = useSpring({
    from: {
      opacity: 0,
    },
    opacity: 1,
  });

  const [bar, onMouseEnter, onMouseLeave] = useHoverLoad(
    socket,
    sample,
    setVideoLabels,
    setFrameData
  );
  return (
    <SampleDiv className="sample" style={showSamples} title={tooltip}>
      <Player51
        src={src}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
        }}
        sample={sample}
        metadata={metadata}
        thumbnail={true}
        activeLabels={activeLabels}
        {...eventHandlers}
        filterSelector={selectors.labelFilters}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
      <div className="sample-info" {...eventHandlers}>
        {Object.keys(sample)
          .sort()
          .reduce((acc, name) => {
            const label = sample[name];
            if (label && label._cls === "Classifications") {
              return [
                ...acc,
                ...label[label._cls.toLowerCase()].map((l, i) => ({
                  name,
                  label: l,
                  idx: i,
                })),
              ];
            }
            return [...acc, { name, label }];
          }, [])
          .map(renderLabel)}
        {[...sample.tags].sort().map((t) => {
          return activeTags[t] ? (
            <Tag key={t} name={String(t)} color={colorMap[t]} />
          ) : null;
        })}
        {Object.keys(sample).sort().map(renderScalar)}
      </div>
      {selectedSamples.has(id) ? (
        <div
          style={{
            border: "2px solid rgb(255, 109, 4)",
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      ) : null}
      {bar.map(({ key, props }) => (
        <LoadingBar key={key} style={props} />
      ))}
    </SampleDiv>
  );
};

export default connect(Sample);
