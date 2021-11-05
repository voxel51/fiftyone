import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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

import { move } from "@fiftyone/utilities";

import * as schemaAtoms from "../../recoil/schema";
import { State } from "../../recoil/types";
import LabelTagsCell from "./LabelTags";
import SampleTagsCell from "./SampleTags";
import DropdownHandle, {
  DropdownHandleProps,
  PlusMinusButton,
} from "../DropdownHandle";
import { Close, IndeterminateCheckBoxSharp } from "@material-ui/icons";
import { Entry, PathEntry as PathEntryComponent, TextEntry } from "./Entries";
import { useEventHandler } from "../../utils/hooks";

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

const InteractiveGroupEntry = React.memo(
  ({ name, modal }: { name: string; modal: boolean }) => {
    const [expanded, setExpanded] = useRecoilState(groupShown({ name, modal }));

    return (
      <GroupHeader
        title={name}
        expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      />
    );
  }
);

const InteractivePathEntry = React.memo(
  ({ modal, path }: { modal: boolean; path: string; group: string }) => {
    return <PathEntryComponent modal={modal} path={path} disabled={false} />;
  }
);

enum EntryKind {
  EMPTY = "EMPTY",
  GROUP = "GROUP",
  PATH = "PATH",
  TAIL = "TAIL",
}

interface EmptyEntry {
  kind: EntryKind.EMPTY;
  shown: boolean;
}

interface TailEntry {
  kind: EntryKind.TAIL;
}

interface GroupEntry {
  kind: EntryKind.GROUP;
  name: string;
}

interface PathEntry {
  kind: EntryKind.PATH;
  path: string;
  shown: boolean;
}

type SidebarEntry = EmptyEntry | GroupEntry | PathEntry | TailEntry;

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

const sidebarGroups = atomFamily<SidebarGroups, boolean>({
  key: "sidebarGroups",
  default: defaultSidebarGroups,
});

const sidebarGroupNames = selectorFamily<string[], boolean>({
  key: "sidebarGroupNames",
  get: (modal) => ({ get }) => {
    return get(sidebarGroups(modal)).map(([name]) => name);
  },
});

const sidebarEntries = selectorFamily<SidebarEntry[], boolean>({
  key: "sidebarEntries",
  get: (modal) => ({ get }) => {
    return [
      ...get(sidebarGroups(modal))
        .map(([groupName, paths]) => {
          const group: GroupEntry = { name: groupName, kind: EntryKind.GROUP };
          const shown = get(groupShown({ name: groupName, modal }));

          if (paths.length) {
            return [
              group,
              ...paths.map<PathEntry>((path) => ({
                path,
                kind: EntryKind.PATH,
                shown,
              })),
            ];
          }

          return [group, { kind: EntryKind.EMPTY, shown } as EmptyEntry];
        })
        .flat(),
      { kind: EntryKind.TAIL } as TailEntry,
    ];
  },
  set: (modal) => ({ get, set }, value) => {
    if (value instanceof DefaultValue) {
      set(sidebarGroups(modal), get(defaultSidebarGroups(modal)));
      return;
    }

    set(
      sidebarGroups(modal),
      value.reduce((result, entry) => {
        if (entry.kind === EntryKind.GROUP) {
          return [...result, [entry.name, []]];
        }

        if (entry.kind === EntryKind.PATH) {
          result[result.length - 1][1] = [
            ...result[result.length - 1][1],
            entry.path,
          ];
        }

        return result;
      }, [])
    );
  },
});

const positionEntry = (
  entries: SidebarEntry[],
  order: number[],
  elements: HTMLDivElement[],
  index: number,
  y: number
) => {
  const cache = {};

  const isShown = (index) => {
    const entry = entries[index];

    if (index in cache) {
      return cache[index];
    }

    if (!elements[index]) {
      cache[index] = false;
    } else if (entry.kind === EntryKind.PATH) {
      cache[index] = entry.shown;
    } else if (entry.kind === EntryKind.EMPTY) {
      cache[index] = entry.shown;
    } else {
      cache[index] = true;
    }

    !cache[index] && console.log(elements[index], entry);

    return cache[index];
  };

  return {
    y: order.slice(0, index).reduce((y, index) => {
      return isShown(index)
        ? y + elements[index].getBoundingClientRect().height + 3
        : y;
    }, y),
    left: isShown(order[index]) ? "unset" : -3000,
    immediate: true,
  };
};

const fn = (
  entries: SidebarEntry[],
  order: number[],
  elements: HTMLDivElement[],
  active = false,
  originalIndex = 0,
  curIndex = 0,
  y = 0
) => {
  return (index: number) => {
    const member = active && index === originalIndex;

    if (member) {
      return {
        ...positionEntry(entries, order, elements, curIndex, y),
        zIndex: 1,
        immediate: (key: string) => key === "zIndex",
        config: (key: string) => (key === "y" ? config.stiff : config.default),
      };
    }

    return {
      ...positionEntry(entries, order, elements, order.indexOf(index), 0),
      zIndex: 0,
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
  }
`;

const AddGroupDiv = styled.div`
  box-sizing: border-box;
  background-color: ${({ theme }) => theme.background};
  cursor: pointer;
  font-weight: bold;
  user-select: none;
  padding-top: 2px;

  display: flex;
  justify-content: space-between;

  & > input {
    color: ${({ theme }) => theme.fontDark};
    font-size: 14px !important;
    font-size: 1rem;
    width: 100%;
    background: transparent;
    box-shadow: none;
    border: none;
    outline: none;
    border-bottom: 2px solid ${({ theme }) => theme.backgroundLight};
    text-transform: uppercase;
    font-weight: bold;
    padding: 3px;
  }
`;

const AddGroup = ({
  modal,
  onSubmit,
}: {
  modal: boolean;
  onSubmit: (name: string) => void;
}) => {
  const [value, setValue] = useState("");
  const currentGroups = useRecoilValue(sidebarGroupNames(modal));

  return (
    <AddGroupDiv>
      <input
        type={"text"}
        placeholder={"+ add group"}
        value={value}
        maxLength={140}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (!currentGroups.includes(value)) {
              onSubmit(value);
              setValue("");
            } else {
              alert(`${value.toUpperCase()} is already a group name`);
            }
          }
        }}
      />
    </AddGroupDiv>
  );
};

const InteractiveSidebar = ({ modal }: { modal: boolean }) => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(modal));
  const order = useRef<number[]>(entries.map((_, index) => index));
  const refs = useRef<HTMLDivElement[]>(entries.map(() => null));
  const down = useRef<number>(null);
  const lastLength = useRef<number>(0);
  const start = useRef<number>(0);

  order.current = entries.map((_, index) => index);
  refs.current = entries
    .map((_, index) => index)
    .map((_, i) => refs.current[i] || null);

  const [springs, api] = useSprings(
    entries.length,
    fn(entries, order.current, refs.current),
    [entries]
  );

  const observer = useRef(
    new ResizeObserver(() => {
      api.start(fn(entries, order.current, refs.current));
    })
  );

  useEventHandler(refs.current, "mousedown", (event) => {
    down.current = event.target.dataset.index;
  });
  useEventHandler(refs.current, "mouseup", () => (down.current = null));
  useEventHandler(refs.current, "mousemove", () => {
    if (down.current == null) {
      return;
    }
  });

  const newLength = entries.filter(
    (entry) => entry.shown === undefined || entry.shown
  ).length;
  const resize =
    refs.current.some((e) => e === null) || newLength !== lastLength.current;

  useLayoutEffect(() => {
    resize && api.start(fn(entries, order.current, refs.current));
  }, [resize]);
  lastLength.current = newLength;

  let groupName = null;

  return (
    <InteractiveSidebarContainer>
      {springs.map(({ zIndex, y, left }, i) => {
        const entry = entries[i];
        if (entry.kind === EntryKind.GROUP) {
          groupName = entry.name;
        }

        return (
          <animated.div
            data-index={i}
            ref={(node) => {
              node && observer.current.observe(node);
              !node && observer.current.unobserve(refs.current[i]);
              refs.current[i] = node;
            }}
            key={i}
            style={{
              zIndex,
              y,
              left,
            }}
            children={
              entry.kind === EntryKind.TAIL ? (
                <AddGroup
                  onSubmit={(name) => {
                    const newEntries = [...entries];
                    newEntries.splice(entries.length - 1, 0, {
                      kind: EntryKind.GROUP,
                      name,
                    });
                    setEntries(newEntries);
                  }}
                  modal={modal}
                />
              ) : entry.kind === EntryKind.GROUP ? (
                <InteractiveGroupEntry name={groupName} modal={modal} />
              ) : entry.kind == EntryKind.EMPTY ? (
                <TextEntry text={"No fields"} />
              ) : (
                <InteractivePathEntry
                  modal={modal}
                  path={entry.path}
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
