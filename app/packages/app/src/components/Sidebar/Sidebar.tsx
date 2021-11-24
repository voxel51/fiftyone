import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDropDown,
  ArrowDropUp,
  Check,
  Close,
  Edit,
  Filter,
} from "@material-ui/icons";
import {
  atomFamily,
  DefaultValue,
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { animated, Controller } from "@react-spring/web";
import styled from "styled-components";

import { move, removeKeys } from "@fiftyone/utilities";

import * as filterAtoms from "../../recoil/filters";
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
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_LABEL_TYPES,
  VALID_PRIMITIVE_TYPES,
} from "../../recoil/constants";
import { fieldIsFiltered } from "../../recoil/filters";
import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../Filters";
import { Pills } from "./utils";

const MARGIN = 4;

const GroupHeaderStyled = styled(DropdownHandle)`
  border-radius: 0;
  border-width: 0 0 1px 0;
  padding: 0.25rem;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  align-items: center;
  color: ${({ theme }) => theme.fontDark};
`;

const GroupInput = styled.input`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  text-transform: uppercase;
  font-weight: bold;
  color: ${({ theme }) => theme.fontDark};
`;

type GroupHeaderProps = {
  pills?: React.ReactNode;
  title: string;
  setValue?: (name: string) => void;
  onDelete?: () => void;
} & DropdownHandleProps;

export const GroupHeader = ({
  title,
  icon,
  pills,
  onDelete,
  setValue,
  ...rest
}: GroupHeaderProps) => {
  const [localValue, setLocalValue] = useState(() => title);
  useLayoutEffect(() => {
    setLocalValue(title);
  }, [title]);
  const [editing, setEditing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const ref = useRef<HTMLInputElement>();

  return (
    <GroupHeaderStyled
      title={title}
      icon={PlusMinusButton}
      {...rest}
      onMouseEnter={() => !hovering && setHovering(true)}
      onMouseLeave={() => hovering && setHovering(false)}
    >
      <GroupInput
        ref={ref}
        maxLength={40}
        value={localValue}
        focus={editing}
        style={{ flexGrow: 1, pointerEvents: editing ? "unset" : "none" }}
        onChange={(event) => setLocalValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            setValue(event.target.value);
            setEditing(false);
          }
        }}
        onFocus={() => !editing && setEditing(true)}
        onBlur={() => editing && setEditing(false)}
      />
      {hovering && !editing && setValue && (
        <span title={"Rename group"}>
          <Edit
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              setEditing(true);
              if (ref.current) {
                ref.current.setSelectionRange(0, ref.current.value.length);
                ref.current.focus();
              }
            }}
          />
        </span>
      )}
      {pills}
      {onDelete && !editing && (
        <span title={"Delete group"}>
          <Close
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => onDelete()}
          />
        </span>
      )}
    </GroupHeaderStyled>
  );
};

const groupShown = atomFamily<boolean, { name: string; modal: boolean }>({
  key: "sidebarGroupShown",
  default: true,
});

const numGroupFields = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFields",
  get: (params) => ({ get }) => get(sidebarGroup(params)).length,
});

const numGroupFieldsFiltered = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFieldsFiltered",
  get: (params) => ({ get }) => {
    let count = 0;

    for (const path of get(sidebarGroup(params))) {
      if (get(fieldIsFiltered({ path, modal: params.modal }))) count++;
    }

    return count;
  },
});

const numGroupFieldsActive = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFieldsActive",
  get: (params) => ({ get }) => {
    let count = 0;
    const active = new Set(
      get(schemaAtoms.activeFields({ modal: params.modal }))
    );

    for (const path of get(sidebarGroup(params))) {
      if (active.has(path)) count++;
    }

    return count;
  },
});

const useRenameGroup = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async (newName: string) => {
      const groups = await snapshot.getPromise(sidebarGroups(modal));
      set(
        sidebarGroups(modal),
        groups.map<[string, string[]]>(([name, paths]) => [
          name === group ? newName : name,
          paths,
        ])
      );
    },
    []
  );
};

const useDeleteGroup = (modal: boolean, group: string) => {
  const numFields = useRecoilValue(numGroupFields({ modal, group }));
  const onDelete = useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const groups = await snapshot.getPromise(sidebarGroups(modal));
      set(
        sidebarGroups(modal),
        groups.filter(([name]) => name !== group)
      );
    },
    []
  );

  if (numFields) {
    return null;
  }

  return onDelete;
};

const useClearActive = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const paths = await snapshot.getPromise(sidebarGroup({ modal, group }));
      const active = await snapshot.getPromise(
        schemaAtoms.activeFields({ modal })
      );

      set(
        schemaAtoms.activeFields({ modal }),
        active.filter((p) => !paths.includes(p))
      );
    },
    [modal, group]
  );
};

const useClearFiltered = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const paths = await snapshot.getPromise(sidebarGroup({ modal, group }));
      const filters = await snapshot.getPromise(
        modal ? filterAtoms.modalFilters : filterAtoms.filters
      );
      set(
        modal ? filterAtoms.modalFilters : filterAtoms.filters,
        removeKeys(filters, paths)
      );
    },
    [modal, group]
  );
};

const InteractiveGroupEntry = React.memo(
  ({ name, modal }: { name: string; modal: boolean }) => {
    const [expanded, setExpanded] = useRecoilState(groupShown({ name, modal }));
    const renameGroup = useRenameGroup(modal, name);
    const onDelete = useDeleteGroup(modal, name);

    return (
      <GroupHeader
        title={name}
        expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        setValue={(value) => renameGroup(value)}
        onDelete={onDelete}
        pills={
          <Pills
            entries={[
              {
                count: useRecoilValue(
                  numGroupFieldsActive({ modal, group: name })
                ),
                onClick: useClearFiltered(modal, name),
                icon: <Filter />,
                title: "Clear filters",
              },
              {
                count: useRecoilValue(
                  numGroupFieldsActive({ modal, group: name })
                ),
                onClick: useClearActive(modal, name),
                icon: <Check />,
                title: "Clear shown",
              },
            ]
              .filter(({ count }) => count > 0)
              .map(({ count, ...rest }) => ({
                ...rest,
                text: count.toLocaleString(),
              }))}
          />
        }
      />
    );
  }
);

const FILTERS: {
  [key: string]: React.FC<{ modal: boolean; path: string; named?: boolean }>;
} = {
  [BOOLEAN_FIELD]: BooleanFieldFilter,
  [DATE_FIELD]: NumericFieldFilter,
  [DATE_TIME_FIELD]: NumericFieldFilter,
  [FLOAT_FIELD]: NumericFieldFilter,
  [FRAME_NUMBER_FIELD]: NumericFieldFilter,
  [FRAME_SUPPORT_FIELD]: NumericFieldFilter,
  [INT_FIELD]: NumericFieldFilter,
  [OBJECT_ID_FIELD]: StringFieldFilter,
  [STRING_FIELD]: StringFieldFilter,
};

const getFilterData = (
  path: string,
  modal: boolean,
  parent: State.Field,
  fields: State.Field[]
): { ftype: string; path: string; modal: boolean; named?: boolean }[] => {
  if (schemaAtoms.meetsFieldType(parent, { ftype: VALID_PRIMITIVE_TYPES })) {
    let ftype = parent.ftype;
    if (ftype === LIST_FIELD) {
      ftype = parent.subfield;
    }

    return [
      {
        ftype,
        path,
        modal,
        named: false,
      },
    ];
  }

  const label = VALID_LABEL_TYPES.includes(parent.embeddedDocType);
  const bbox = ["Detection"];

  return fields
    .filter(({ name }) => label && name === "tags")
    .map(({ ftype, subfield, name }) => ({
      path: [path, name].join("."),
      modal,
      ftype: ftype === LIST_FIELD ? subfield : ftype,
      named: true,
    }));
};

const InteractiveEntry = React.memo(
  ({ modal, path }: { modal: boolean; path: string; group: string }) => {
    const [expanded, setExpanded] = useState(false);
    const Arrow = expanded ? ArrowDropUp : ArrowDropDown;
    const expandedPath = useRecoilValue(schemaAtoms.expandPath(path));
    const fields = useRecoilValue(
      schemaAtoms.fields({
        path: expandedPath,
        ftype: VALID_PRIMITIVE_TYPES,
      })
    );
    const field = useRecoilValue(schemaAtoms.field(path));
    const data = getFilterData(expandedPath, modal, field, fields);

    return (
      <PathEntryComponent
        modal={modal}
        path={path}
        disabled={false}
        pills={
          <Arrow
            style={{ cursor: "pointer", margin: 0 }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setExpanded(!expanded);
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          />
        }
      >
        {expanded
          ? data.map(({ ftype, ...props }) =>
              React.createElement(FILTERS[ftype], {
                key: props.path,
                ...props,
              })
            )
          : null}
      </PathEntryComponent>
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
    const labels = [...frameLabels, ...sampleLabels];

    const otherSampleFields = get(
      schemaAtoms.fieldPaths({
        space: State.SPACE.SAMPLE,
        ftype: EMBEDDED_DOCUMENT_FIELD,
      })
    ).filter((path) => !labels.includes(path));

    const groups = {
      labels: sampleLabels,
      primitives: get(
        schemaAtoms.fieldPaths({
          ftype: VALID_PRIMITIVE_TYPES,
          space: State.SPACE.SAMPLE,
        })
      ),
      ...otherSampleFields.reduce((other, current) => {
        other[current] = get(
          schemaAtoms.fieldPaths({
            path: current,
            ftype: VALID_PRIMITIVE_TYPES,
          })
        );
        return other;
      }, {}),
    };

    if (frameLabels.length) {
      groups["frame labels"] = frameLabels;
    }

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

const sidebarGroup = selectorFamily<
  string[],
  { modal: boolean; group: string }
>({
  key: "sidebarGroup",
  get: (params) => ({ get }) => {
    return get(sidebarGroups(params.modal)).filter(
      ([name]) => name === params.group
    )[0][1];
  },
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

    if (shown) {
      y += el.getBoundingClientRect().height + MARGIN;
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
      shown = shown && paths === 0 && entry.shown;
    }

    results[key] = {
      cursor: dragging ? "grabbing" : "pointer",
      top: dragging ? currentY[key] + delta : y,
      zIndex: dragging ? 1 : 0,
      left: shown ? "unset" : -3000,
    };

    if (shown) {
      y += el.getBoundingClientRect().height + MARGIN;
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

const isShown = (entry: SidebarEntry) => {
  if (entry.kind === EntryKind.PATH && !entry.shown) {
    return false;
  }

  if (entry.kind === EntryKind.EMPTY && !entry.shown) {
    return false;
  }

  if (entry.kind === EntryKind.TAIL || entry.kind === EntryKind.EMPTY) {
    return false;
  }

  return true;
};

const measureEntries = (
  items: InteractiveItems,
  order: string[]
): { top: number; height: number; key: string }[] => {
  const data = [];
  let previous = { top: 0, height: 0 };

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const entry = items[key].entry;

    if (!isShown(entry)) continue;

    const height = items[key].el.getBoundingClientRect().height;
    const top = previous.top + previous.height + MARGIN;
    data.push({ key, height, top });
    previous = { top, height };
  }

  return data;
};

const measureGroups = (
  items: InteractiveItems,
  order: string[]
): { top: number; height: number; key: string }[] => {
  const data = [];
  let current = { top: 0, height: 0, key: null };
  let top = 0;

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const entry = items[key].entry;

    if (entry.kind === EntryKind.GROUP) {
      data.push(current);
      current = { top, height: 0, key };
    }

    if (!isShown(entry)) continue;

    const height = items[key].el.getBoundingClientRect().height;
    top += height + MARGIN;
  }

  return data;
};

const getAfterKey = (
  activeKey: string,
  items: InteractiveItems,
  order: string[],
  direction: Direction
): string | null => {
  if (!items[activeKey].el) {
    return;
  }

  const baseTop = items[order[0]].el.parentElement.getBoundingClientRect().y;
  const { top, bottom } = items[activeKey].el.getBoundingClientRect();
  const y = (direction === Direction.UP ? top : bottom) - baseTop;
  const isGroup = items[activeKey].entry.kind === EntryKind.GROUP;

  const data = isGroup
    ? measureGroups(items, order)
    : measureEntries(items, order);

  const filtered = data
    .map(({ key, top, height }, i) => {
      const midpoint = top + height / 2;
      return {
        delta: direction === Direction.UP ? midpoint - y : y - midpoint,
        i,
        key,
      };
    })
    .sort((a, b) => a.delta - b.delta)
    .filter(({ delta }) => delta > 0);

  if (!filtered.length) {
    return isGroup ? null : order[1];
  }

  const result = filtered[0].key;

  if (isGroup) {
    if (result === null) {
      return null;
    }
    let index = order.indexOf(result) + 1;
    while (items[order[index]].entry.kind === EntryKind.PATH) index++;
    return order[index];
  }

  if (order.indexOf(result) === 0) {
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

enum Direction {
  UP = "UP",
  DOWN = "DOWN",
}

const InteractiveSidebar = ({ modal }: { modal: boolean }) => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(modal));
  const order = useRef<string[]>([]);
  const down = useRef<string>(null);
  const last = useRef<number>(null);
  const lastDirection = useRef<Direction>(null);
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

  const getNewOrder = (direction: Direction): string[] => {
    let after = getAfterKey(
      down.current,
      items.current,
      order.current,
      direction
    );

    let entry = items.current[down.current].entry;
    if (down.current === after && entry.kind === EntryKind.GROUP) {
      const ai = order.current.indexOf(after) - 1;
      after = ai >= 0 ? order.current[ai] : null;
    }

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

    return [...result, ...section, ...pool.slice(i)];
  };

  useEventHandler(document.body, "mouseup", (event) => {
    if (start.current === event.clientY || down.current == null) {
      down.current = null;
      start.current = null;
      return;
    }

    const newOrder = getNewOrder(lastDirection.current);
    const results = fn(items.current, order.current, newOrder);
    if (order.current.some((key, i) => newOrder[i] !== key)) {
      order.current = newOrder;
      setEntries(order.current.map((key) => items.current[key].entry));
    }
    for (const key of newOrder) {
      items.current[key].controller.set(results[key]);
    }

    down.current = null;
    start.current = null;
    lastDirection.current = null;
  });

  useEventHandler(document.body, "mousemove", (event) => {
    if (down.current == null) return;

    const delta = event.clientY - last.current;
    if (Math.abs(delta) <= 1) return;

    const entry = items.current[down.current].entry;
    lastDirection.current =
      event.clientY - last.current > 0 ? Direction.DOWN : Direction.UP;
    if (![EntryKind.PATH, EntryKind.GROUP].includes(entry.kind)) return;

    requestAnimationFrame(() => {
      const realDelta = event.clientY - start.current;
      const newOrder = getNewOrder(lastDirection.current);
      const results = fn(
        items.current,
        order.current,
        newOrder,
        down.current,
        realDelta
      );
      for (const key of order.current)
        items.current[key].controller.start(results[key]);

      last.current = event.clientY;
    });
  });

  const trigger = useCallback((event) => {
    if (event.button !== 0) return;
    down.current = event.currentTarget.dataset.key;
    start.current = event.clientY;
    last.current = start.current;
  }, []);

  useEffect(() => {
    const placements = fn(items.current, order.current, order.current);
    for (const key of order.current)
      items.current[key].controller.set(placements[key]);
  }, [entries]);

  const [observer] = useState<ResizeObserver>(
    () =>
      new ResizeObserver(() => {
        const placements = fn(items.current, order.current, order.current);
        for (const key of order.current)
          items.current[key].controller.set(placements[key]);
      })
  );

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
                observer.unobserve(items.current[key].el);
              }
              items.current[key].el = node;
              if (node) {
                observer.observe(node);
                node.addEventListener("mousedown", trigger);
                // forces placement on rerender. fix me?
                node.style.top = items.current[key].controller.springs.top.goal;
              }
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
                <InteractiveEntry
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
