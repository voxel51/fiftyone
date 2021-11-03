import React, { useRef, useState } from "react";
import {
  atomFamily,
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
  editable: boolean;
  group;
  name: string;
  paths: string[];
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

    return prioritySort(groups, ["labels", "frame labels"]);
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

const positionEntry = (
  order: number[],
  elements: HTMLDivElement[],
  index: number,
  y: number
) =>
  order
    .slice(0, index)
    .reduce(
      (y, index) =>
        elements[index]
          ? y + elements[index].getBoundingClientRect().height
          : y,
      y
    );

const fn = (
  entries: { name: string; group: boolean }[],
  order: number[],
  elements: HTMLDivElement[],
  active = false,
  originalIndex = 0,
  curIndex = 0,
  y = 0
) => (index: number) => {
  if (active && index === originalIndex) {
    if (entries[order[curIndex]].group) {
    }

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

const InteractiveSideBarContainer = styled.div`
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

const InteractiveSideBar = ({
  groups,
  modal,
  onChange,
}: {
  groups: SidebarGroups;
  onChange: (groups: SidebarGroups) => void;
  modal: boolean;
}) => {
  const entries = groups
    .map(([groupName, names]) => [
      { name: groupName, group: true },
      ...names.map((name) => ({ name, group: false })),
    ])
    .flat();
  const [attached, setAttached] = useState(false);
  const order = useRef(entries.map((_, index) => index));
  const refs = useRef<HTMLDivElement[]>(entries.map(() => null));
  const [springs, api] = useSprings(
    order.current.length,
    fn(entries, order.current, refs.current),
    [attached]
  );
  const bind = useDrag(({ args: [originalIndex], active, movement: [, y] }) => {
    const curIndex = order.current.indexOf(originalIndex);
    const curRow = clamp(0, 0, entries.length - 1);
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
      if (entries[newOrder[0]].group) {
        order.current = newOrder;
      }
      onChange(
        order.current.reduce((result, i) => {
          if (entries[i].group) {
            return [...result, [entries[i].name, []]];
          }

          const num = result.length;

          result[num - 1][1] = [...result[num - 1][1], entries[i].name];

          return result;
        }, [])
      );
    }
  });
  let groupName = null;

  return (
    <InteractiveSideBarContainer ref={() => !attached && setAttached(true)}>
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
    </InteractiveSideBarContainer>
  );
};

export type SidebarProps = {
  modal: boolean;
};

const Sidebar = React.memo(({ modal }: SidebarProps) => {
  const [interactiveGroups, setGroups] = useRecoilState(sidebarGroups(modal));

  return (
    <>
      <SampleTagsCell key={"sample-tags"} modal={modal} />
      <LabelTagsCell key={"label-tags"} modal={modal} />
      <InteractiveSideBar
        groups={interactiveGroups}
        onChange={setGroups}
        modal={modal}
      />
    </>
  );
});

export default Sidebar;
