import React, { useState } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import { animated, useSpring, useTransition } from "react-spring";
import { Checkbox } from "@material-ui/core";

import { labelFilters } from "./Filters/LabelFieldFilters.state";
import * as labelAtoms from "./Filters/utils";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import socket, { http } from "../shared/connection";
import { packageMessage } from "../utils/socket";
import { useVideoData, useTheme } from "../utils/hooks";
import { VALID_CLASS_TYPES, VALID_LIST_TYPES } from "../utils/labels";
import { prettify } from "../utils/generic";

const SampleDiv = animated(styled.div`
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 10px ${({ theme }) => theme.backgroundDark};
  background-color: ${({ theme }) => theme.backgroundDark};
  width: 100%;
`);

const SampleInfoDiv = animated(styled.div`
  position: absolute;
  bottom: 0;
  padding: 0.5rem;
  max-height: 100%;
  overflow-y: auto;
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
  width: 100%;
  z-index: 498;
  pointer-events: none;
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

const useHoverLoad = (socket, id) => {
  const [barItem, setBarItem] = useState([]);
  const [loaded, setLoaded] = useState(null);

  const requestLabels = useVideoData(socket, id, (data, player) => {
    if (!data) return;
    const { labels, counter } = data;
    setLoaded(counter);
    setBarItem([]);
    player.updateOverlay(labels);
    if (player.isHovering()) player.play();
  });

  const onMouseEnter = useRecoilCallback(
    ({ snapshot }) => async (e) => {
      const isVideo = await snapshot.getPromise(selectors.isVideoDataset);
      const counter = await snapshot.getPromise(atoms.viewCounter);
      if (!isVideo) return;
      e.preventDefault();
      const {
        data: { player },
      } = e;
      if (loaded === counter) {
        barItem.length && setBarItem([]);
        player.play();
        return;
      }
      setBarItem([0]);
      requestLabels(player);
    },
    [barItem, loaded]
  );

  const onMouseLeave = () => barItem.length && setBarItem([]);

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

const SampleInfo = React.memo(({ id }) => {
  const activeFields = useRecoilValue(labelAtoms.activeFields(false));
  const colorMap = useRecoilValue(selectors.colorMap(false));
  const scalars = useRecoilValue(selectors.scalarNames("sample"));
  const colorByLabel = useRecoilValue(atoms.colorByLabel(false));
  const labelTypes = useRecoilValue(selectors.labelTypesMap);
  const sample = useRecoilValue(atoms.sample(id));

  const dbFields = useRecoilValue(selectors.scalarsDbMap("sample"));

  const bubbles = activeFields.reduce((acc, cur) => {
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
          color={colorMap(cur)}
          title={tag}
          maxWidth={"calc(100% - 32px)"}
        />,
      ];
    } else if (cur.startsWith("_label_tags.")) {
      const tag = cur.slice("_label_tags.".length);
      const count = sample._label_tags[tag] || 0;
      if (count > 0) {
        acc = [
          ...acc,
          <Tag
            key={cur}
            name={`${tag}: ${count}`}
            color={colorMap(cur)}
            title={`${tag}: ${count}`}
            maxWidth={"calc(100% - 32px)"}
          />,
        ];
      }
    } else if (
      scalars.includes(cur) &&
      ![null, undefined].includes(sample[dbFields[cur]])
    ) {
      const value = prettify(sample[dbFields[cur]], false);
      acc = [
        ...acc,
        <Tag
          key={"scalar-" + cur + "" + value}
          title={`${cur}: ${value}`}
          name={value}
          color={colorByLabel ? colorMap(value) : colorMap(cur)}
          maxWidth={"calc(100% - 32px)"}
        />,
      ];
    } else if (VALID_CLASS_TYPES.includes(labelTypes[cur])) {
      const labelType = labelTypes[cur];

      const values = VALID_LIST_TYPES.includes(labelType)
        ? sample[cur] && sample[cur].classifications
          ? sample[cur].classifications
          : []
        : sample[cur]
        ? [sample[cur]]
        : [];
      acc = [
        ...acc,
        values
          .map((v) => prettify(v.label, false))
          .map((v) => (
            <Tag
              key={"scalar-" + cur + "" + v}
              title={`${cur}: ${v}`}
              name={[undefined, null].includes(v) ? "None" : v}
              color={colorByLabel ? colorMap(v) : colorMap(cur)}
              maxWidth={"calc(100% - 32px)"}
            />
          )),
      ];
    }
    return acc;
  }, []);

  return <SampleInfoDiv>{bubbles}</SampleInfoDiv>;
});

const SelectorDiv = animated(styled.div`
  position: absolute;
  width: 100%;
  top: 0;
  right: 0;
  display: flex;
  cursor: pointer;
  z-index: 499;
  background: linear-gradient(
    0deg,
    rgba(0, 0, 0, 0) 0%,
    ${({ theme }) => theme.backgroundDark} 90%
  );
`);

const argMin = (array) => {
  return [].reduce.call(array, (m, c, i, arr) => (c < arr[m] ? i : m), 0);
};

const useSelect = (id: string) => {
  return useRecoilCallback(
    ({ snapshot, set, reset }) => async (e: {
      ctrlKey: boolean;
      preventDefault: () => void;
    }) => {
      e.preventDefault();
      const [selectedSamples, stateDescription, indices] = await Promise.all([
        snapshot.getPromise(atoms.selectedSamples),
        snapshot.getPromise(atoms.stateDescription),
        snapshot.getPromise(selectors.sampleIndices),
      ]);
      const index = indices[id];
      const newSelected = new Set<string>(selectedSamples);
      const setOne = () => {
        if (newSelected.has(id)) {
          newSelected.delete(id);
        } else {
          newSelected.add(id);
        }
      };
      const ind = await snapshot.getPromise(selectors.sampleIndices);
      const rev = Object.fromEntries(
        Object.entries(ind).map((i) => [i[1], i[0]])
      );
      const entries = Object.entries(ind)
        .filter((e) => newSelected.has(e[0]))
        .map((e) => [...e, Math.abs(e[1] - index)]);
      if (e.ctrlKey && !newSelected.has(id) && entries.length) {
        const best = entries[argMin(entries.map((e) => e[2]))][1];

        const [start, end] = best > index ? [index, best] : [best, index];
        for (let idx = start; idx <= end; idx++) {
          newSelected.add(rev[idx]);
        }
      } else {
        setOne();
      }
      selectedSamples.forEach(
        (s) => !newSelected.has(s) && reset(atoms.isSelectedSample(s))
      );
      newSelected.forEach(
        (s) => !selectedSamples.has(s) && set(atoms.isSelectedSample(s), true)
      );
      set(atoms.selectedSamples, newSelected);
      socket.send(
        packageMessage("set_selection", { _ids: Array.from(newSelected) })
      );
      set(atoms.stateDescription, {
        ...stateDescription,
        selected: [...newSelected],
      });
    },
    [id]
  );
};

const Selector = React.memo(({ id, spring }: { id: string; spring: any }) => {
  const theme = useTheme();
  const isSelected = useRecoilValue(atoms.isSelectedSample(id));

  const handleClick = useSelect(id);
  return (
    <SelectorDiv
      style={{ ...spring }}
      onClick={handleClick}
      title={"Click to select sample, Ctrl+Click to select a range"}
    >
      <Checkbox
        checked={isSelected}
        style={{
          color: theme.brand,
        }}
        disableRipple={true}
        title={"Click to select sample, Ctrl+Click to select a range"}
      />
    </SelectorDiv>
  );
});

const Sample = ({ id }) => {
  const setModal = useSetRecoilState(atoms.modal);
  const sample = useRecoilValue(atoms.sample(id));
  const src = `${http}/filepath/${encodeURI(sample.filepath)}?id=${id}`;
  const colorByLabel = useRecoilValue(atoms.colorByLabel(false));
  const [hovering, setHovering] = useState(false);
  const isSelected = useRecoilValue(atoms.isSelectedSample(id));

  const [bar, onMouseEnter, onMouseLeave] = useHoverLoad(socket, sample._id);
  const selectorSpring = useSpring({
    opacity: hovering || isSelected ? 1 : 0,
  });

  const selectSample = useSelect(id);

  const onClick = useRecoilCallback(
    ({ snapshot }) => async (e) => {
      const hasSelected = (await snapshot.getPromise(atoms.selectedSamples))
        .size;
      if (hasSelected) {
        selectSample(e);
      } else {
        setModal({ visible: true, sample_id: id });
      }
    },
    [id]
  );

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
        <SampleInfo id={id} />
        <Player51
          src={src}
          style={{
            height: "100%",
            width: "100%",
            position: "absolute",
            cursor: "pointer",
          }}
          id={id}
          thumbnail={true}
          activeLabelsAtom={labelAtoms.activeFields(false)}
          colorByLabel={colorByLabel}
          filterSelector={labelFilters(false)}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
        {bar.map(({ key, props }) => (
          <LoadingBar key={key} style={props} />
        ))}
      </div>
    </SampleDiv>
  );
};

export default React.memo(Sample);
