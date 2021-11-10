import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { move } from "@fiftyone/utilities";
import { number } from "prop-types";

const MARGIN = 4;

const GroupHeaderStyled = styled(DropdownHandle)`
  border-radius: 0;
  border-width: 0 0 1px 0;
  padding: 0.25rem;
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

          return [
            group,
            {
              kind: EntryKind.EMPTY,
              shown: paths.length === 0 && shown,
              group: groupName,
            } as EmptyEntry,
            ...paths.map<PathEntry>((path) => ({
              path,
              kind: EntryKind.PATH,
              shown,
            })),
          ];
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

const fn = (
  items: InteractiveItems,
  currentOrder: string[],
  newOrder: string[],
  activeKey: string = null,
  delta = 0
) => {
  let groupActive = false;
  const currentY = {};
  let y = 0;
  for (const key of currentOrder) {
    const { entry, el } = items[key];
    if (entry.kind === EntryKind.GROUP) {
      groupActive = key === activeKey;
    }
    let shown = true;

    if (entry.kind === EntryKind.PATH) {
      shown = entry.shown;
    } else if (entry.kind === EntryKind.EMPTY) {
      shown = entry.shown;
    }

    currentY[key] = y;

    if (shown) {
      y += getHeight(el) + MARGIN;
    }
  }

  const results = {};
  y = 0;

  for (const key of newOrder) {
    const { entry, el } = items[key];
    if (entry.kind === EntryKind.GROUP) {
      groupActive = key === activeKey;
    }

    const dragging =
      (activeKey === key || groupActive) && entry.kind !== EntryKind.TAIL;

    let shown = true;

    if (entry.kind === EntryKind.PATH) {
      shown = entry.shown;
    } else if (entry.kind === EntryKind.EMPTY) {
      shown = entry.shown;
    }

    results[key] = {
      cursor: dragging ? "grabbing" : "pointer",
      top: dragging ? currentY[key] + delta : y,
      immediate: (k) =>
        dragging ||
        activeKey === null ||
        ["left", "zIndex", "cursor"].includes(k),
      zIndex: dragging ? 1 : 0,
      left: shown ? "unset" : -3000,
    };

    if (shown) {
      y += getHeight(el) + MARGIN;
    }
  }

  return results;
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

const getAfterKey = (
  activeKey: string,
  items: InteractiveItems,
  order: string[],
  y: number
): string => {
  const top = getY(items[order[0]].el);

  const tops: Array<{ top: number; key: string }> = order
    .map((key) => ({ height: getHeight(items[key].el) + MARGIN, key }))
    .reduce((tops, { height, key }) => {
      const add = tops.length ? tops[tops.length - 1].top : top;
      return [...tops, { top: add + height, key }];
    }, []);

  y += tops.filter(({ key }) => key === activeKey)[0].top;

  let groupKey = null;
  const isGroup = items[activeKey].entry.kind === EntryKind.GROUP;
  const result = tops
    .map(({ key, top }) => ({ delta: Math.abs(top - y), key }))
    .filter(({ key }) => {
      const { entry } = items[key];
      if (isGroup) {
        return entry.kind === EntryKind.GROUP;
      }

      if (entry.kind === EntryKind.GROUP) {
        groupKey = key;
      }

      return groupKey !== activeKey && key !== activeKey;
    })
    .sort((a, b) => a.delta - b.delta)[0].key;

  if (isGroup) {
    let end = order.indexOf(result) + 1;
  }
  return result;
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
    controller: Controller;
    entry: SidebarEntry;
  };
};

const InteractiveSidebar = ({ modal }: { modal: boolean }) => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(modal));
  const order = useRef<string[]>([]);
  const down = useRef<string>(null);
  const start = useRef<number>(0);
  const items = useRef<InteractiveItems>({});
  let group = null;
  order.current = entries.map((entry) => getEntryKey(entry));
  for (const entry of entries) {
    if (entry.kind === EntryKind.GROUP) {
      group = entry.name;
    }

    const key = getEntryKey(entry);

    if (!(key in items)) {
      items.current[key] = {
        el: null,
        controller: new Controller({ top: 0, zIndex: 0, left: "unset" }),
        entry,
      };
    } else {
      items.current[key].entry = entry;
    }
  }

  const getNewOrder = (event: MouseEvent): string[] => {
    const delta = event.clientY - start.current;
    const after = getAfterKey(
      down.current,
      items.current,
      order.current,
      delta
    );
    let entry = items.current[down.current].entry;
    const kind = entry.kind;
    let result = order.current;
    const from = order.current.indexOf(down.current);
    const to = order.current.indexOf(after);
    let count = 0;
    do {
      result = move(result, from, to);
      entry = items.current[result[from]].entry;

      if (kind === EntryKind.PATH) return result;
      if (entry.kind === EntryKind.GROUP) count++;
    } while (count < 2 && EntryKind.TAIL !== entry.kind);

    return result;
  };

  useEventHandler(document.body, "mouseup", (event) => {
    if (start.current === event.clientY || down.current == null) {
      down.current = null;
      start.current = null;
      return;
    }

    const entry = items.current[down.current].entry;
    if (![EntryKind.PATH, EntryKind.GROUP].includes(entry.kind)) {
      down.current = null;
      start.current = null;
      return;
    }

    const newOrder = getNewOrder(event);
    const results = fn(items.current, order.current, newOrder);

    for (const key of order.current) {
      items.current[key].controller.start(results[key]);
    }

    if (order.current.some((key, i) => newOrder[i] !== key)) {
      order.current = newOrder;
      setEntries(order.current.map((key) => items.current[key].entry));
    }
    down.current = null;
    start.current = null;
  });

  useEventHandler(document.body, "mousemove", (event) => {
    if (down.current == null) return;

    const entry = items.current[down.current].entry;
    if (![EntryKind.PATH, EntryKind.GROUP].includes(entry.kind)) return;
    const newOrder = getNewOrder(event);
    const delta = event.clientY - start.current;
    const results = fn(
      items.current,
      order.current,
      newOrder,
      down.current,
      delta
    );
    for (const key of order.current)
      items.current[key].controller.start(results[key]);
  });

  useLayoutEffect(() => {
    const results = fn(items.current, order.current, order.current);
    for (const key of order.current) {
      items.current[key].controller.start(results[key]);
    }
  }, [entries]);

  return (
    <InteractiveSidebarContainer>
      {entries.map((entry) => {
        const key = getEntryKey(entry);
        if (entry.kind === EntryKind.GROUP) {
          group = entry.name;
        }

        return (
          <animated.div
            data-key={key}
            ref={(node) => {
              const handler = (event) => {
                down.current = event.currentTarget.dataset.key;
                start.current = event.clientY;
              };
              if (node) {
                node.addEventListener("mousedown", handler);
              } else {
                items.current[key].el &&
                  items.current[key].el.removeEventListener(
                    "mousedown",
                    handler
                  );
              }
              items.current[key].el = node;
            }}
            key={key}
            style={items.current[key].controller.springs}
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
      <InteractiveSidebar key={"interactive"} modal={modal} />
    </>
  );
});

export default Sidebar;
