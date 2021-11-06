import React, { useLayoutEffect, useRef, useState } from "react";
import { Close } from "@material-ui/icons";
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
import { PathEntry as PathEntryComponent, TextEntry } from "./Entries";
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
  y: number,
  emptyGroups: Set<string>
) => {
  const cache = {};
  let group = null;
  const hidden = entries.map((entry, i) => {
    if (entry.kind === EntryKind.GROUP) {
      group = entry.name;
    }

    if (entry.kind === EntryKind.EMPTY) {
      return !emptyGroups.has(group);
    }

    return false;
  });

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
      cache[index] = entry.shown && !hidden[index];
    } else {
      cache[index] = true;
    }

    return cache[index];
  };

  return {
    y: order.slice(0, index).reduce((y, index) => {
      return isShown(index)
        ? y + elements[index].getBoundingClientRect().height + 3
        : y;
    }, y),
    left: isShown(order[index]) ? "unset" : -3000,
  };
};

const fn = (
  entries: SidebarEntry[],
  currentOrder: number[],
  newOrder: number[],
  elements: HTMLDivElement[],
  activeIndex = null,
  delta = 0,
  commit = false
) => {
  const isMember = (index: number) => {
    if (activeIndex === null) {
      return false;
    }

    const entry = entries[activeIndex];
    if (entry.kind !== EntryKind.GROUP) {
      return index === activeIndex;
    }

    let group = null;
    let searchIndex = 0;
    for (const entry of entries) {
      if (searchIndex > index) break;

      if (entry.kind === EntryKind.GROUP) group = entry.name;
      searchIndex++;
    }

    return entry.name === group;
  };

  const groups = entries.filter(
    (entry) => entry.kind === EntryKind.GROUP
  ) as GroupEntry[];
  const emptyGroups = new Set(groups.map(({ name }: GroupEntry) => name));
  let currentGroup = null;
  for (const index of newOrder) {
    const entry = entries[index];
    if (entry.kind === EntryKind.GROUP) currentGroup = entry.name;
    else if (entry.kind === EntryKind.PATH && emptyGroups.has(currentGroup))
      emptyGroups.delete(currentGroup);
  }

  return (index: number) => {
    if (isMember(index)) {
      return {
        ...positionEntry(
          entries,
          commit ? newOrder : currentOrder,
          elements,
          commit ? newOrder.indexOf(index) : currentOrder.indexOf(index),
          commit ? 0 : delta,
          emptyGroups
        ),
        zIndex: 1,
        immediate: !commit,
      };
    }

    return {
      ...positionEntry(
        entries,
        newOrder,
        elements,
        newOrder.indexOf(index),
        0,
        emptyGroups
      ),
      zIndex: 0,
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

const getY = (el: HTMLElement) => {
  return el ? el.getBoundingClientRect().y : 0;
};

const getHeight = (el: HTMLDivElement) => {
  return el ? el.getBoundingClientRect().height : 0;
};

const getCurrentIndex = (
  activeIndex: number,
  order: number[],
  entries: SidebarEntry[],
  elements: HTMLDivElement[],
  y: number
): number => {
  const top = getY(elements[order[0]]);

  const tops = order
    .map((i) => ({ height: getHeight(elements[i]) + 3, i }))
    .reduce((tops, { height, i }) => {
      const add = tops.length ? tops[tops.length - 1].top : top;
      return [...tops, { top: add + height, i }];
    }, []);

  y += tops.filter(({ i }) => i === activeIndex)[0].top;
  const sorted = tops
    .map(({ i, top }) => ({ delta: Math.abs(top - y), i }))
    .sort((a, b) => {
      return a.delta - b.delta;
    });

  let winner = sorted[0].i;
  if (entries[activeIndex].kind === EntryKind.PATH) {
    winner = Math.max(1, winner);
  }

  return Math.min(winner, entries.length - 2);
};

const InteractiveSidebar = ({ modal }: { modal: boolean }) => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(modal));
  const order = useRef<number[]>(entries.map((_, index) => index));
  const refs = useRef<HTMLDivElement[]>(entries.map(() => null));
  const down = useRef<number>(null);
  const lastLength = useRef<number>(0);
  const start = useRef<number>(0);
  const entriesRef = useRef<SidebarEntry[]>();
  entriesRef.current = entries;

  order.current = entries.map((_, index) => index);
  refs.current = entries
    .map((_, index) => index)
    .map((_, i) => refs.current[i] || null);

  const [springs, api] = useSprings(
    entries.length,
    fn(entries, order.current, order.current, refs.current),
    [entries]
  );

  const getNewOrder = (event: MouseEvent) => {
    const delta = event.clientY - start.current;
    const orderIndex = order.current.indexOf(down.current);

    return move(
      order.current,
      orderIndex,
      getCurrentIndex(
        down.current,
        order.current,
        entriesRef.current,
        refs.current,
        delta
      )
    );
  };

  useEventHandler(refs.current, "mousedown", (event: MouseEvent) => {
    down.current = parseInt(event.currentTarget.dataset.index, 10);
    start.current = event.clientY;
  });

  useEventHandler(document.body, "mouseup", (event) => {
    if (down.current == null) return;

    const entry = entriesRef.current[down.current];
    if (entry.kind !== EntryKind.PATH) return;

    const newOrder = getNewOrder(event);
    api.start(
      fn(
        entries,
        order.current,
        newOrder,
        refs.current,
        down.current,
        event.clientY - start.current,
        true
      )
    );
    order.current = newOrder;
    down.current = null;
    start.current = null;
  });

  useEventHandler(document.body, "mousemove", (event) => {
    if (down.current == null) return;

    const entry = entriesRef.current[down.current];
    if (entry.kind !== EntryKind.PATH) return;

    api.start(
      fn(
        entries,
        order.current,
        getNewOrder(event),
        refs.current,
        down.current,
        event.clientY - start.current
      )
    );
  });

  const newLength = entries.filter((entry) => {
    if (entry.kind === EntryKind.PATH) return entry.shown;

    if (entry.kind === EntryKind.EMPTY) return entry.shown;

    return true;
  }).length;
  const resize =
    refs.current.some((e) => e === null) || newLength !== lastLength.current;

  useLayoutEffect(() => {
    resize &&
      api.start(fn(entries, order.current, order.current, refs.current));
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
            ref={(node) => (refs.current[i] = node)}
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
