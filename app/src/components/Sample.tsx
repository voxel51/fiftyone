import React, { useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { animated, useSpring, useTransition } from "react-spring";

import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import * as labelAtoms from "./Filters/utils";
import { packageMessage } from "../utils/socket";
import { useVideoData, useTheme } from "../utils/hooks";
import { Checkbox } from "@material-ui/core";
import { stringify } from "../utils/labels";

const SampleDiv = animated(styled.div`
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 10px ${({ theme }) => theme.backgroundDark};
  background-color: ${({ theme }) => theme.backgroundDark};
  width: 100%;
`);

const SampleInfoDiv = styled.div`
  height: 43px;
  display: block;
  position: absolute;
  bottom: 0;
  padding: 0.5rem;
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
  scrollbar-width: none;
  overflow-x: scroll;
  width: 100%;
  pointer-events: none;
  z-index: 10000;
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
    return [[], (e) => {}, (e) => {}];
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

const revealSample = () => {
  return useSpring({
    from: {
      opacity: 0,
    },
    opacity: 1,
  });
};

const SampleInfo = ({ sample }) => {
  const activeFields = useRecoilValue(labelAtoms.activeFields(false));
  const colorMap = useRecoilValue(selectors.colorMap);
  const scalars = useRecoilValue(selectors.scalarNames("sample"));
  const colorByLabel = useRecoilValue(atoms.colorByLabel);

  return (
    <SampleInfoDiv>
      {activeFields.reduce((acc, cur) => {
        if (
          cur.startsWith("tags.") &&
          Array.isArray(sample.tags) &&
          sample.tags.includes(cur.slice(5))
        ) {
          const tag = cur.slice(5);
          acc = [
            ...acc,
            <Tag
              key={cur}
              name={tag}
              color={colorMap[tag]}
              title={tag}
              maxWidth={"calc(100% - 32px)"}
            />,
          ];
        } else if (
          scalars.includes(cur) &&
          ![null, undefined].includes(sample[cur])
        ) {
          const value = stringify(sample[cur]);
          acc = [
            ...acc,
            <Tag
              key={"scalar-" + cur + "" + value}
              title={`${cur}: ${value}`}
              name={value}
              color={colorByLabel ? colorMap[value] : colorMap[cur]}
            />,
          ];
        }
        return acc;
      }, [])}
    </SampleInfoDiv>
  );
};

const SelectorDiv = animated(styled.div`
  position: absolute;
  width: 100%;
  top: 0;
  right: 0;
  background: rgb(0, 0, 0);
  background: linear-gradient(
    0deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(34, 38, 42, 1) 90%
  );
  display: flex;
  direction: rtl;
  cursor: pointer;
  z-index: 10000;
`);

const Selector = ({ id, spring }: { id: string }) => {
  const theme = useTheme();
  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );

  const [selectedSamples, setSelectedSamples] = useRecoilState(
    atoms.selectedSamples
  );
  const socket = useRecoilValue(selectors.socket);

  const handleClick = (e) => {
    e.preventDefault();
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
    socket.send(packageMessage(event, { _id: id }));
    setStateDescription({ ...stateDescription, selected: [...newSelected] });
  };
  return (
    <SelectorDiv style={{ ...spring }} onClick={handleClick}>
      <Checkbox
        checked={selectedSamples.has(id)}
        style={{
          color: theme.brand,
        }}
        title={"Click to select sample"}
      />
    </SelectorDiv>
  );
};

const Sample = ({ sample, metadata }) => {
  const http = useRecoilValue(selectors.http);
  const id = sample._id;
  const src = `${http}/filepath/${encodeURI(sample.filepath)}?id=${id}`;
  const socket = useRecoilValue(selectors.socket);
  const colorByLabel = useRecoilValue(atoms.colorByLabel);
  const [hovering, setHovering] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);

  const [bar, onMouseEnter, onMouseLeave] = useHoverLoad(socket, sample);
  const selectorSpring = useSpring({
    opacity: hovering || selectedSamples.has(id) ? 1 : 0,
  });

  return (
    <SampleDiv className="sample" style={revealSample()}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <Selector key={id} id={id} spring={selectorSpring} />
        <SampleInfo sample={sample} />
        <Player51
          src={src}
          style={{
            height: "100%",
            width: "100%",
            position: "absolute",
            cursor: "pointer",
          }}
          sample={sample}
          metadata={metadata}
          thumbnail={true}
          activeLabelsAtom={labelAtoms.activeFields(false)}
          colorByLabel={colorByLabel}
          filterSelector={labelFilters(false)}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={(e) => {}}
        />
        {bar.map(({ key, props }) => (
          <LoadingBar key={key} style={props} />
        ))}
      </div>
    </SampleDiv>
  );
};

export default React.memo(Sample);
