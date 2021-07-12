import React, { useRef, useState } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { Checkbox } from "@material-ui/core";

import * as labelAtoms from "./Filters/utils";
import Looker from "./Looker";
import Tag from "./Tags/Tag";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import socket from "../shared/connection";
import { packageMessage } from "../utils/socket";
import { useTheme } from "../utils/hooks";
import { useSetModal } from "../recoil/utils";
import { VALID_CLASS_TYPES, VALID_LIST_TYPES } from "../utils/labels";
import { prettify } from "../utils/generic";
import { VideoLooker } from "@fiftyone/looker";
import { labelFilters } from "./Filters/LabelFieldFilters.state";

const SampleDiv = styled.div`
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 10px ${({ theme }) => theme.backgroundDark};
  background-color: ${({ theme }) => theme.backgroundDark};
  width: 100%;
`;

const SampleInfoDiv = styled.div`
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
`;

const SampleInfo = React.memo(({ sampleId }: { sampleId: string }) => {
  const activeFields = useRecoilValue(labelAtoms.activeFields(false));
  const colorMap = useRecoilValue(selectors.colorMap(false));
  const scalars = useRecoilValue(selectors.scalarNames("sample"));
  const colorByLabel = useRecoilValue(atoms.colorByLabel(false));
  const labelTypes = useRecoilValue(selectors.labelTypesMap);
  const sample = useRecoilValue(atoms.sample(sampleId));
  const filters = useRecoilValue(labelFilters(false));

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
      console.log(sample);
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
          .filter((v) => filters[cur] && filters[cur](v))
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

const Selector = React.memo(
  ({ sampleId, spring }: { sampleId: string; spring: any }) => {
    const theme = useTheme();
    const isSelected = useRecoilValue(atoms.isSelectedSample(sampleId));

    const handleClick = useSelect(sampleId);
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
          title={"Click to select sample, Ctrl+Click to select a range"}
        />
      </SelectorDiv>
    );
  }
);

const Sample = ({ sampleId }: { sampleId: string }) => {
  const [hovering, setHovering] = useState(false);
  const isSelected = useRecoilValue(atoms.isSelectedSample(sampleId));
  const lookerRef = useRef<VideoLooker>();

  const selectorSpring = useSpring({
    opacity: hovering || isSelected ? 1 : 0,
  });

  const selectSample = useSelect(sampleId);
  const setModal = useSetModal();

  const onClick = useRecoilCallback(
    ({ snapshot }) => async (event: React.MouseEvent) => {
      const hasSelected = (await snapshot.getPromise(atoms.selectedSamples))
        .size;
      if (hasSelected) {
        selectSample(event);
      } else {
        lookerRef.current &&
          lookerRef.current.pause &&
          lookerRef.current.pause();
        setModal(sampleId);
      }
    },
    [sampleId]
  );

  return (
    <SampleDiv
      className="sample"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Selector key={sampleId} sampleId={sampleId} spring={selectorSpring} />
      <SampleInfo sampleId={sampleId} />
      <Looker
        onClick={onClick}
        style={{
          position: "absolute",
          cursor: "pointer",
        }}
        sampleId={sampleId}
        modal={false}
        lookerRef={lookerRef}
      />
    </SampleDiv>
  );
};

export default React.memo(Sample);
