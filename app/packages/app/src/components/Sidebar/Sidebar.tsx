import React, { useRef, useState } from "react";
import { atomFamily, selectorFamily, useRecoilState } from "recoil";
import { animated, config, useSprings, useSpring } from "@react-spring/web";
import styled from "styled-components";
import { clamp } from "lodash";
import { useDrag } from "@use-gesture/react";

import { move } from "@fiftyone/utilities";

import { useTheme } from "../../utils/hooks";
import * as schemaAtoms from "../../recoil/schema";
import { State } from "../../recoil/types";
import LabelTagsCell from "./LabelTags";
import SampleTagsCell from "./SampleTags";
import DropdownHandle, {
  DropdownHandleProps,
  PlusMinusButton,
} from "../DropdownHandle";
import { Close } from "@material-ui/icons";

const GroupHeaderStyled = styled(DropdownHandle)`
  border-radius: 0;
  border-width: 0 0 1px 0;
  padding: 0.25rem;
  margin-bottom: 6px;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
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

const ButtonDiv = animated(styled.div`
  cursor: pointer;
  margin-left: 0;
  margin-right: 0;
  padding: 2.5px 0.5rem;
  border-radius: 3px;
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
`);

const OptionTextDiv = animated(styled.div`
  padding-right: 0.25rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  color: inherit;
  line-height: 1.7;
  & > span {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
`);

export const OptionText = ({ style, children }) => {
  return (
    <OptionTextDiv style={style}>
      <span>{children}</span>
    </OptionTextDiv>
  );
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

const fn = (
  order: number[],
  active = false,
  originalIndex = 0,
  curIndex = 0,
  y = 0
) => (index: number) =>
  active && index === originalIndex
    ? {
        y: curIndex * 100 + y,
        scale: 1.1,
        zIndex: 1,
        shadow: 15,
        immediate: (key: string) => key === "zIndex",
        config: (key: string) => (key === "y" ? config.stiff : config.default),
      }
    : {
        y: order.indexOf(index) * 100,
        scale: 1,
        zIndex: 0,
        shadow: 1,
        immediate: false,
      };

export const Button = ({
  onClick,
  text,
  children = null,
  style,
  color = null,
  title = null,
}) => {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  color = color ?? theme.brand;
  const props = useSpring({
    backgroundColor: hover ? color : theme.background,
    color: hover ? theme.font : theme.fontDark,
    config: {
      duration: 150,
    },
  });
  return (
    <ButtonDiv
      style={{ ...props, userSelect: "none", ...style }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title ?? text}
    >
      <OptionText key={"button"} style={{ fontWeight: "bold", width: "100%" }}>
        {text}
      </OptionText>
      {children}
    </ButtonDiv>
  );
};

const InteractiveSideBar = ({
  groups,
  onChange,
}: {
  groups: SidebarGroups;
  onChange: (groups: SidebarGroups) => void;
}) => {
  const entries = groups
    .map(([groupName, names]) => [
      { name: groupName, group: true },
      ...names.map((name) => ({ name, group: false })),
    ])
    .flat();

  const order = useRef(entries.flatMap((_, index) => index));
  const [springs, api] = useSprings(order.current.length, fn(order.current));
  const bind = useDrag(({ args: [originalIndex], active, movement: [, y] }) => {
    const curIndex = order.current.indexOf(originalIndex);
    const curRow = clamp(
      Math.round((curIndex * 100 + y) / 100),
      0,
      entries.length - 1
    );
    const newOrder = move(order.current, curIndex, curRow);
    api.start(fn(newOrder, active, originalIndex, curIndex, y));
    if (!active) {
      order.current = newOrder;
      onChange(
        newOrder.reduce((result, i) => {
          if (entries[i].group) {
            return [...result, [entries[i].name, []]];
          }

          result[result.length - 1][1] = [
            ...result[result.length - 1][1],
            entries[i].name,
          ];

          return result;
        }, [])
      );
    }
  });

  return (
    <>
      {springs.map(({ zIndex, shadow, y, scale }, i) => (
        <animated.div
          {...bind(i)}
          key={i}
          style={{
            zIndex,
            boxShadow: shadow.to(
              (s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`
            ),
            y,
            scale,
          }}
          children={entries[i].name}
        />
      ))}
    </>
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
      <InteractiveSideBar groups={interactiveGroups} onChange={setGroups} />
    </>
  );
});

export default Sidebar;
