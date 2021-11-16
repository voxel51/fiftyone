import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  FILTERABLE_TYPES,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  STRING_FIELD,
} from "../../recoil/constants";

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
    return (
      <PathEntryComponent
        modal={modal}
        path={path}
        disabled={false}
      ></PathEntryComponent>
    );
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
    const sampleLabels = get(
      schemaAtoms.labelFields({ space: State.SPACE.SAMPLE })
    );
    const labels = [...frameLabels, sampleLabels];

    const otherSampleFields = get(
      schemaAtoms.fieldPaths({ ftype: EMBEDDED_DOCUMENT_FIELD })
    ).filter((path) => !labels.includes(path));

    const groups = {
      labels: sampleLabels,
      primitives: get(
        schemaAtoms.fieldPaths({
          ftype: FILTERABLE_TYPES,
          space: State.SPACE.SAMPLE,
        })
      ),
      ...otherSampleFields.reduce((other, current) => {
        other[current] = get(
          schemaAtoms.fieldPaths({ path: current, ftype: FILTERABLE_TYPES })
        );
        return other;
      }, {}),
    };

    console.log(otherSampleFields);

    if (frameLabels.length) {
      groups["frame labels"] = frameLabels;
    }

    console.log("GROUPS", groups);

    return prioritySort(groups, [
      "metadata",
      "labels",
      "frame labels",
      "primitives",
    ]);
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
            ...paths.map<PathEntry>((path) => ({
              path,
              kind: EntryKind.PATH,
              shown,
            })),
            {
              kind: EntryKind.EMPTY,
              shown: paths.length === 0 && shown,
              group: groupName,
            } as EmptyEntry,
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

    if (key === activeKey) {
      if (y + delta < 0) {
        // delta = y;
      }
    }

    if (shown) {
      y += getHeight(el) + MARGIN;
    }
  }

  const results = {};
  y = 0;
  let paths = 0;

  for (const key of newOrder) {
    const { entry, el } = items[key];
    if (entry.kind === EntryKind.GROUP) {
      groupActive = key === activeKey;
      paths = 0;
    }

    const dragging =
      (activeKey === key || groupActive) && entry.kind !== EntryKind.TAIL;

    let shown = true;

    if (entry.kind === EntryKind.PATH) {
      shown = entry.shown;
      paths++;
    } else if (entry.kind === EntryKind.EMPTY) {
      shown = shown && paths === 0;
    }

    results[key] = {
      cursor: dragging ? "grabbing" : "grabbing",
      top: dragging ? currentY[key] + delta : y,
      zIndex: dragging ? 1 : 0,
      left: shown ? "unset" : -3000,
    };

    if (shown) {
      y += getHeight(el) + MARGIN;
    }

    if (activeKey) {
      results[key].immediate = (k) =>
        dragging || ["left", "zIndex", "cursor"].includes(k);
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
): string | null => {
  const top = getY(items[order[0]].el);

  const data: Array<{ top: number; key: string; height: number }> = order
    .map((key) => ({ height: getHeight(items[key].el) + MARGIN, key }))
    .reduce(
      (tops, { height, key }) => {
        return [
          ...tops,
          {
            top: tops[tops.length - 1].top + tops[tops.length - 1].height,
            height,
            key,
          },
        ];
      },
      [{ top, height: 0, key: null }]
    );

  y += data.filter(({ key }) => key === activeKey)[0].top;

  let groupKey = null;
  const isGroup = items[activeKey].entry.kind === EntryKind.GROUP;
  const result = data
    .map(({ key, top, height }, i) => ({
      delta: Math.abs(top + height / 2 - y),
      key,
    }))
    .filter(({ key }) => {
      if (key === activeKey) {
        return false;
      }

      if (key === null) {
        return isGroup;
      }

      const { entry } = items[key];
      if (isGroup) {
        return entry.kind === EntryKind.GROUP;
      }

      if (entry.kind === EntryKind.GROUP) {
        groupKey = key;
      }

      if (entry.kind === EntryKind.TAIL) {
        return false;
      }

      return groupKey !== activeKey;
    })
    .sort((a, b) => a.delta - b.delta)[0].key;

  if (isGroup) {
    if (result === null) {
      return result;
    }
    let index = order.indexOf(result);

    while (index < order.length) {
      index++;
      const entry = items[order[index]].entry;

      if (entry.kind === EntryKind.TAIL) {
        break;
      }

      if (entry.kind === EntryKind.GROUP) {
        break;
      }
    }

    return order[index - 1];
  }

  if (!isGroup && order.indexOf(result) === 0) {
    return order[1];
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
        controller: new Controller({
          cursor: "pointer",
          top: 0,
          zIndex: 0,
          left: "unset",
        }),
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
    let from = order.current.indexOf(down.current);
    const to = after ? order.current.indexOf(after) : 0;

    if (entry.kind === EntryKind.PATH) {
      return move(order.current, from, to);
    }

    const section = [];
    do {
      section.push(order.current[from]);
      from++;
      entry = items.current[order.current[from]].entry;
    } while (entry.kind !== EntryKind.GROUP && entry.kind !== EntryKind.TAIL);

    if (after === null) {
      return [
        ...section,
        ...order.current.filter((key) => !section.includes(key)),
      ];
    }
    const result = [];
    const pool = order.current.filter((key) => !section.includes(key));
    let i = 0;
    let terminate = false;
    while (i < pool.length && !terminate) {
      result.push(pool[i]);
      terminate = pool[i] === after;
      i++;
    }

    return [...result, ...section, ...pool.slice(i + 1)];
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
      items.current[key].controller.set(results[key]);
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
    items.current[down.current].el.scrollIntoView();
  });

  const trigger = useCallback((event) => {
    down.current = event.currentTarget.dataset.key;
    start.current = event.clientY;
  }, []);

  useLayoutEffect(() => {
    const placements = fn(items.current, order.current, order.current);
    for (const key of order.current)
      items.current[key].controller.set(placements[key]);
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
              if (items.current[key].el) {
                items.current[key].el.removeEventListener("mousedown", trigger);
              }

              if (node) {
                node.addEventListener("mousedown", trigger);
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
