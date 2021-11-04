import React, { useEffect, useRef, useState } from "react";
import {
  atomFamily,
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { animated, config, useSprings } from "@react-spring/web";
import styled from "styled-components";
import { clamp } from "lodash";
import { useDrag } from "@use-gesture/react";

import { move } from "@fiftyone/utilities";

import * as schemaAtoms from "../../recoil/schema";
import { State } from "../../recoil/types";
import LabelTagsCell from "./LabelTags";
import SampleTagsCell from "./SampleTags";
import DropdownHandle, {
  DropdownHandleProps,
  PlusMinusButton,
} from "../DropdownHandle";
import { Close } from "@material-ui/icons";
import { PathEntry } from "./Entries";

const GroupHeaderStyled = styled(DropdownHandle)`
  border-radius: 0;
  border-width: 0 0 1px 0;
  padding: 0.25rem;
  margin-bottom: 6px;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  color: ${({ theme }) => theme.fontDark};
`;

type GroupHeaderProps = {
  pills?: JSX.Element[];
  title: string;
  icon?: JSX.Element;
  onDelete?: () => void;
} & DropdownHandleProps;

export const GroupHeader = ({
  title,
  icon,
  pills,
  onDelete,
  ...rest
}: GroupHeaderProps) => {
  return (
    <GroupHeaderStyled title={title} icon={PlusMinusButton} {...rest}>
      {onDelete && (
        <Close
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onDelete();
          }}
        />
      )}
      {icon}
      <span style={{ flexGrow: 1 }}>{title}</span>
      {...pills}
    </GroupHeaderStyled>
  );
};

const groupShown = atomFamily<boolean, { name: string; modal: boolean }>({
  key: "sidebarGroupShown",
  default: true,
});

const InteractiveGroupEntry = ({
  name,
  modal,
}: {
  name: string;
  modal: boolean;
}) => {
  const [expanded, setExpanded] = useRecoilState(groupShown({ name, modal }));

  return (
    <GroupHeader
      title={name}
      expanded={expanded}
      onClick={() => setExpanded(!expanded)}
    />
  );
};

const InteractivePathEntry = ({
  modal,
  path,
  group,
}: {
  modal: boolean;
  path: string;
  group: string;
}) => {
  const shown = useRecoilValue(groupShown({ name: group, modal }));

  if (!shown) {
    return null;
  }

  return <PathEntry modal={modal} path={path} disabled={false} />;
};

type SidebarEntry = {
  group: boolean;
  name: string;
};

type SidebarGroups = [string, string[]][];

const prioritySort = (
  groups: { [key: string]: string[] },
  priorities: string[]
): SidebarGroups => {
  return Object.entries(groups).sort(
    ([a], [b]) => priorities.indexOf(a) - priorities.indexOf(b)
  );
};

const defaultSidebarGroups = selectorFamily<SidebarGroups, boolean>({
  key: "defaultSidebarGroups",
  get: (modal) => ({ get }) => {
    const frameLabels = get(
      schemaAtoms.labelFields({ space: State.SPACE.FRAME })
    );

    const groups = {
      labels: get(schemaAtoms.labelFields({ space: State.SPACE.SAMPLE })),
    };

    if (frameLabels.length) {
      groups["frame labels"] = frameLabels;
    }

    return prioritySort(groups, ["metadata", "labels", "frame labels"]);
  },
});

const defaultSidebarGroupNames = selectorFamily<string[], boolean>({
  key: "defaultSidebarGroupNames",
  get: (modal) => ({ get }) =>
    get(defaultSidebarGroups(modal)).map(([name]) => name),
});

const sidebarGroups = atomFamily<SidebarGroups, boolean>({
  key: "sidebarGroups",
  default: defaultSidebarGroups,
});

const sidebarEntries = selectorFamily<SidebarEntry[], boolean>({
  key: "sidebarEntries",
  get: (modal) => ({ get }) => {
    let shown = null;
    return get(sidebarGroups(modal))
      .map(([groupName, names]) => [
        { name: groupName, group: true },
        ...names.map((name) => ({ name, group: false })),
      ])
      .flat()
      .filter(({ name, group }) => {
        if (group) {
          shown = get(groupShown({ modal, name }));
        }

        return group || shown;
      });
  },
  set: (modal) => ({ get, set }, value) => {
    if (value instanceof DefaultValue) {
      set(sidebarGroups(modal), get(defaultSidebarGroups(modal)));
      return;
    }

    const currentGroups = Object.fromEntries(get(sidebarGroups(modal)));

    set(
      sidebarGroups(modal),
      value.reduce((result, entry) => {
        if (entry.group) {
          const shown = get(groupShown({ modal, name: entry.name }));
          return [
            ...result,
            [entry.name, shown ? [] : currentGroups[entry.name]],
          ];
        }

        const num = result.length;

        result[num - 1][1] = [...result[num - 1][1], entry.name];
        return result;
      }, [])
    );
  },
});

const positionEntry = (
  order: number[],
  elements: HTMLDivElement[],
  index: number,
  y: number
) =>
  order.slice(0, index).reduce((y, index) => {
    return elements[index]
      ? y + elements[index].getBoundingClientRect().height
      : y;
  }, y);

const fn = (
  entries: { name: string; group: boolean }[],
  order: number[],
  elements: HTMLDivElement[],
  active = false,
  originalIndex = 0,
  curIndex = 0,
  y = 0
) => {
  const groups = {};
  let currentGroup = null;
  for (const { group, name } of entries) {
    if (group) {
      groups[name] = new Set();
      currentGroup = groups[name];
      continue;
    }

    currentGroup.add(name);
  }

  return (index: number) => {
    const member = active && index === originalIndex;

    if (member) {
      return {
        y: positionEntry(order, elements, curIndex, y),
        zIndex: 1,
        immediate: (key: string) => key === "zIndex",
        config: (key: string) => (key === "y" ? config.stiff : config.default),
      };
    }

    return {
      y: positionEntry(order, elements, order.indexOf(index), 0),
      scale: 1,
      zIndex: 0,
      shadow: 0,
      immediate: false,
    };
  };
};

const InteractiveSidebarContainer = styled.div`
  position: relative;
  height: auto;
  overflow: visible;

  & > div {
    position: absolute;
    transform-origin: 50% 50% 0px;
    touch-action: none;
    width: 100%;
    margin: 3px;
  }
`;

const getY = (el?: HTMLElement) => {
  return el ? el.getBoundingClientRect().y : 0;
};

const InteractiveSidebar = ({ modal }: { modal: boolean }) => {
  const [attached, setAttached] = useState(false);
  const [entries, setEntries] = useRecoilState(sidebarEntries(modal));
  const order = useRef<number[]>(entries.map((_, index) => index));
  const refs = useRef<HTMLDivElement[]>(entries.map(() => null));

  useEffect(() => {
    order.current = entries.map((_, index) => index);
    refs.current = entries.map(() => null);
  }, [entries]);

  const [springs, api] = useSprings(
    entries.length,
    fn(entries, order.current, refs.current),
    [entries]
  );

  useEffect(() => {
    attached && api.start(fn(entries, order.current, refs.current));
  }, [attached]);

  const bind = useDrag(({ args: [originalIndex], active, movement: [, y] }) => {
    const curIndex = order.current.indexOf(originalIndex);
    const top = getY(refs.current[originalIndex]);

    const curRow = clamp(
      order.current
        .map((oi, i) => ({
          y: getY(refs.current[oi]),
          i,
          oi,
        }))
        .filter(({ oi }) => oi !== originalIndex)
        .sort((a, b) => Math.abs(b.y - top) - Math.abs(a.y - top))[0].i,
      0,
      entries.length - 1
    );
    const newOrder = move(order.current, curIndex, curRow);

    api.start(
      fn(
        entries,
        entries[newOrder[0]].group ? newOrder : order.current,
        refs.current,
        active,
        originalIndex,
        curIndex,
        y
      )
    );
    if (!active) {
      order.current = entries[newOrder[0]].group ? newOrder : order.current;
      setEntries(order.current.map((i) => entries[i]));
    }
  });
  let groupName = null;

  return (
    <InteractiveSidebarContainer ref={() => !attached && setAttached(true)}>
      {springs.map(({ zIndex, shadow, y, scale }, i) => {
        if (entries[i].group) {
          groupName = entries[i].name;
        }

        return (
          <animated.div
            {...bind(i)}
            ref={(node) => (refs.current[i] = node)}
            key={i}
            style={{
              zIndex,
              boxShadow: shadow.to(
                (s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`
              ),
              y,
              scale,
            }}
            children={
              entries[i].group ? (
                <InteractiveGroupEntry name={groupName} modal={modal} />
              ) : (
                <InteractivePathEntry
                  modal={modal}
                  path={entries[i].name}
                  group={groupName}
                />
              )
            }
          />
        );
      })}
    </InteractiveSidebarContainer>
  );
};

export type SidebarProps = {
  modal: boolean;
};

const Sidebar = React.memo(({ modal }: SidebarProps) => {
  return (
    <>
      <SampleTagsCell key={"sample-tags"} modal={modal} />
      <LabelTagsCell key={"label-tags"} modal={modal} />
      <InteractiveSidebar modal={modal} />
    </>
  );
});

export default Sidebar;
