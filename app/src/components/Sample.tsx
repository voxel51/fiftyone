import React, { useContext, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled, { ThemeContext } from "styled-components";
import { animated, useSpring, useTransition } from "react-spring";

import { getColor } from "player51";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { getLabelText, stringify } from "../utils/labels";
import { packageMessage } from "../utils/socket";
import { useFastRerender, useVideoData } from "../utils/hooks";
import { Checkbox } from "@material-ui/core";

const SampleDiv = animated(styled.div`
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 10px ${({ theme }) => theme.backgroundDark};
  background-color: ${({ theme }) => theme.backgroundDark};
`);

const SampleChin = styled.div`
  display: flex;
`;

const SampleInfo = styled.div`
  flex-grow: 1;
  max-height: 42px;
  display: block;
  padding: 0.5rem 0 0.5rem 0.5rem;
  max-width: calc(100% - 43px);
  bottom: 0;
  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`;

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

const useHoverLoad = (socket, sample) => {
  if (sample._media_type !== "video") {
    return [[], () => {}, () => {}];
  }
  const [barItem, setBarItem] = useState([]);
  const [loaded, setLoaded] = useState(null);
  const viewCounter = useRecoilValue(atoms.viewCounter);

  const [requested, requestLabels] = useVideoData(
    socket,
    sample,
    (data, player) => {
      if (!data) return;
      const { labels } = data;
      setLoaded(viewCounter);
      setBarItem([]);
      player.updateOverlay(labels);
      if (player.isHovering()) player.play();
    }
  );

  const onMouseEnter = (event) => {
    event.preventDefault();
    const {
      data: { player },
    } = event;
    if (loaded === viewCounter) {
      barItem.length && setBarItem([]);
      player.play();
      return;
    }
    setBarItem([0]);
    requestLabels(player);
  };

  const onMouseLeave = () => setBarItem([]);

  const bar = useTransition(barItem, (item) => item, {
    from: { right: "100%" },
    enter: {
      right: "0%",
    },
    leave: {
      right: "-100%",
    },
    onRest: (item) => {
      setBarItem(barItem.length ? [item + 1] : []);
    },
  });

  return [bar, onMouseEnter, onMouseLeave];
};

const SelectedDiv = styled.div`
  border-left-width: 1px;
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
  border-left-style: solid;
`;

const Sample = ({ sample, metadata }) => {
  const setModal = useSetRecoilState(atoms.modal);
  const http = useRecoilValue(selectors.http);
  const id = sample._id;
  const src = `${http}/filepath${sample.filepath}?id=${id}`;
  const socket = useRecoilValue(selectors.socket);
  const filter = useRecoilValue(selectors.labelFilters);
  const colorMap = useRecoilValue(selectors.colorMap);
  const colorByLabel = useRecoilValue(atoms.colorByLabel);
  const activeLabels = useRecoilValue(atoms.activeLabels("sample"));
  const activeFrameLabels = useRecoilValue(atoms.activeLabels("frame"));
  const activeTags = useRecoilValue(atoms.activeTags);
  const activeOther = useRecoilValue(atoms.activeOther("sample"));
  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );
  const theme = useContext(ThemeContext);

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
    socket.send(packageMessage(event, { _id: id }));
    setStateDescription({ ...stateDescription, selected: [...newSelected] });
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
        color={colorByLabel ? getColor(value) : colorMap[name]}
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
    const value = stringify(sample[name]);
    return (
      <Tag
        key={"scalar-" + name}
        title={name}
        name={value}
        color={colorByLabel ? value : colorMap[name]}
      />
    );
  };

  const showSamples = useSpring({
    from: {
      opacity: 0,
    },
    opacity: 1,
  });

  const [bar, onMouseEnter, onMouseLeave] = useHoverLoad(socket, sample);

  return (
    <SampleDiv className="sample" style={showSamples}>
      <Player51
        src={src}
        style={{
          height: "calc(100% - 42px)",
          width: "100%",
          position: "relative",
          cursor: "pointer",
        }}
        sample={sample}
        metadata={metadata}
        thumbnail={true}
        activeLabels={activeLabels}
        activeFrameLabels={activeFrameLabels}
        colorByLabel={colorByLabel}
        filterSelector={selectors.labelFilters}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={() => setModal({ visible: true, sample, metadata })}
      />
      <SampleChin>
        <SampleInfo>
          <div
            style={{
              overflowX: "auto",
              overflowY: "hidden",
              display: "flex",
              alignItems: "center",
              marginTop: 3,
            }}
          >
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
        </SampleInfo>
        <SelectedDiv>
          <Checkbox
            checked={selectedSamples.has(id)}
            style={{ color: theme.brand }}
            onClick={() => handleClick()}
          />
        </SelectedDiv>
      </SampleChin>
      {bar.map(({ key, props }) => (
        <LoadingBar key={key} style={props} />
      ))}
    </SampleDiv>
  );
};

export default React.memo(Sample);
