import React, { useLayoutEffect, useRef, useState } from "react";
import { Close } from "@material-ui/icons";
import {
  atomFamily,
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { animated, Controller } from "@react-spring/web";
import styled from "styled-components";

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
  group: string;
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
              { kind: EntryKind.EMPTY, shown, group: groupName } as EmptyEntry,
              ...paths.map<PathEntry>((path) => ({
                path,
                kind: EntryKind.PATH,
                shown,
              })),
            ];
          }
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
  order: string[],
  items: InteractiveItems,
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
          if (e.key === "Enter" && value.length) {
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
  activeKey: string,
  items: InteractiveItems,
  order: string[],
  y: number
): number => {
  const top = getY(items[order[0]].el);

  const tops = order
    .map((key) => ({ height: getHeight(items[key].el) + 3, key }))
    .reduce((tops, { height, key }) => {
      const add = tops.length ? tops[tops.length - 1].top : top;
      return [...tops, { top: add + height, key }];
    }, []);

  y += tops.filter(({ key }) => key === activeKey)[0].top;
  const sorted = tops
    .map(({ key, top }) => ({ delta: Math.abs(top - y), key }))
    .sort((a, b) => {
      return a.delta - b.delta;
    });

  let winner = sorted[0].key;
  if (items[activeKey].entry.kind === EntryKind.PATH) {
    winner = Math.max(1, winner);
  }

  return Math.min(winner, entries.length - 2);
};

const getEntryKey = (entry: SidebarEntry) => {
  if (entry.kind === EntryKind.GROUP) {
    return JSON.stringify([entry.name]);
  }

  if (entry.kind === EntryKind.PATH) {
    return JSON.stringify(["", entry.path]);
  }

  if (entry.kind === EntryKind.EMPTY) {
    return JSON.stringify([entry.group, ""]);
  }

  return "tail";
};

type InteractiveItems = {
  [key: string]: {
    el: HTMLDivElement;
    spring: Controller;
    entry: SidebarEntry;
  };
};

const InteractiveSidebar = ({ modal }: { modal: boolean }) => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(modal));
  const order = useRef<string[]>(entries.map((entry) => getEntryKey(entry)));
  const down = useRef<string>(null);
  const start = useRef<number>(0);
  const items = useRef<InteractiveItems>({});

  let group = null;
  for (const entry of entries) {
    if (entry.kind === EntryKind.GROUP) {
      group = entry.name;
    }

    const key = getEntryKey(entry);

    if (!(key in items)) {
      items.current[key] = {
        el: null,
        spring: new Controller(),
        entry,
      };
    }
  }

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
    if (![EntryKind.PATH, EntryKind.GROUP].includes(entry.kind)) return;

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
    setEntries(order.current.map((i) => entries[i]));
    down.current = null;
    start.current = null;
  });

  useEventHandler(document.body, "mousemove", (event) => {
    if (down.current == null) return;

    const entry = entriesRef.current[down.current];
    if (![EntryKind.PATH, EntryKind.GROUP].includes(entry.kind)) return;

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

  return (
    <InteractiveSidebarContainer>
      {entries.map((entry) => {
        if (entry.kind === EntryKind.GROUP) {
          group = entry.name;
        }
        const key = getEntryKey(entry);

        return (
          <animated.div
            data-key={key}
            ref={(node) => (items.current[key].el = node)}
            key={key}
            style={items.current[key].spring.get()}
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
                <InteractiveGroupEntry name={group} modal={modal} />
              ) : entry.kind == EntryKind.EMPTY ? (
                <TextEntry text={"No fields"} />
              ) : (
                <InteractivePathEntry
                  modal={modal}
                  path={entry.path}
                  group={group}
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
    </>
  );
});

export default Sidebar;
