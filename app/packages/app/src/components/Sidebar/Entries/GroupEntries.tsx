import {
  Add,
  Check,
  Close,
  Edit,
  FilterList,
  LocalOffer,
  Remove,
  Visibility,
} from "@material-ui/icons";
import React, { useLayoutEffect, useRef, useState } from "react";
import {
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import styled from "styled-components";

import { removeKeys } from "@fiftyone/utilities";

import * as aggregationAtoms from "../../../recoil/aggregations";
import * as filterAtoms from "../../../recoil/filters";
import * as schemaAtoms from "../../../recoil/schema";
import { State } from "../../../recoil/types";
import { useTheme } from "../../../utils/hooks";

import { PillButton } from "../../utils";

import {
  groupIsEmpty,
  groupShown,
  sidebarGroup,
  sidebarGroups,
} from "../recoil";

import { elementNames } from "../../../recoil/view";
import { MATCH_LABEL_TAGS, validateGroupName } from "../utils";

const groupLength = selectorFamily<number, { modal: boolean; group: string }>({
  key: "groupLength",
  get: (params) => ({ get }) =>
    get(sidebarGroup({ ...params, loadingTags: true })).length,
});

const TAGS = {
  [State.TagKey.SAMPLE]: "tags",
  [State.TagKey.LABEL]: "label tags",
};

const numMatchedTags = selectorFamily<
  number,
  { key: State.TagKey; modal: boolean }
>({
  key: "numMatchedTags",
  get: (params) => ({ get }) => {
    let count = 0;
    const active = new Set(get(filterAtoms.matchedTags(params)));

    for (const path of get(
      sidebarGroup({
        group: TAGS[params.key],
        modal: params.modal,
        loadingTags: true,
      })
    )) {
      if (active.has(path)) count++;
    }

    return count;
  },
});

const numGroupFieldsFiltered = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFieldsFiltered",
  get: (params) => ({ get }) => {
    let count = 0;

    for (const path of get(sidebarGroup({ ...params, loadingTags: true }))) {
      if (get(filterAtoms.fieldIsFiltered({ path, modal: params.modal })))
        count++;
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

    for (const path of get(sidebarGroup({ ...params, loadingTags: true }))) {
      if (active.has(path)) count++;
    }

    return count;
  },
});

export const useRenameGroup = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async (newName: string) => {
      newName = newName.toLowerCase();

      if (!validateGroupName(newName)) {
        return;
      }

      const groups = await snapshot.getPromise(
        sidebarGroups({ modal, loadingTags: true })
      );
      set(
        sidebarGroups({ modal, loadingTags: true }),
        groups.map<[string, string[]]>(([name, paths]) => [
          name === group ? newName : name,
          paths,
        ])
      );
    },
    []
  );
};

export const useDeleteGroup = (modal: boolean, group: string) => {
  const numFields = useRecoilValue(groupLength({ modal, group }));
  const onDelete = useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const groups = await snapshot.getPromise(
        sidebarGroups({ modal, loadingTags: true })
      );
      set(
        sidebarGroups({ modal, loadingTags: true }),
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
      const paths = await snapshot.getPromise(
        sidebarGroup({ modal, group, loadingTags: true })
      );
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

const getTags = (modal, tagKey) =>
  tagKey === State.TagKey.LABEL
    ? aggregationAtoms.cumulativeValues({
        extended: false,
        modal,
        ...MATCH_LABEL_TAGS,
      })
    : aggregationAtoms.values({ extended: false, modal, path: "tags" });

const useClearMatched = ({
  modal,
  tagKey,
}: {
  modal: boolean;
  tagKey: State.TagKey;
}) => {
  const [matched, setMatched] = useRecoilState(
    filterAtoms.matchedTags({ key: tagKey, modal })
  );

  const current = useRecoilValueLoadable(getTags(modal, tagKey));
  const all = useRecoilValueLoadable(getTags(modal, tagKey));

  useLayoutEffect(() => {
    if (current.state === "loading" || all.state === "loading") return;

    const newMatches = new Set<string>();
    matched.forEach((tag) => {
      current.contents.includes(tag) && newMatches.add(tag);
    });

    newMatches.size !== matched.size && setMatched(newMatches);
  }, [matched, current, all]);

  return () => setMatched(new Set());
};

const useClearFiltered = (modal: boolean, group: string) => {
  return useRecoilCallback(
    ({ set, snapshot }) => async () => {
      let paths = await snapshot.getPromise(
        sidebarGroup({ modal, group, loadingTags: true })
      );
      const filters = await snapshot.getPromise(
        modal ? filterAtoms.modalFilters : filterAtoms.filters
      );

      set(
        modal ? filterAtoms.modalFilters : filterAtoms.filters,
        removeKeys(filters, paths, true)
      );
    },
    [modal, group]
  );
};

type PillEntry = {
  onClick: () => void;
  text: string;
  title: string;
  icon?: React.ReactNode;
};

const Pills = ({ entries }: { entries: PillEntry[] }) => {
  const theme = useTheme();

  return (
    <>
      {entries.map((data, i) => (
        <PillButton
          {...data}
          highlight={false}
          open={false}
          style={{
            height: "1.5rem",
            fontSize: "0.8rem",
            lineHeight: "1rem",
            color: theme.font,
            padding: "0.25rem 0.5rem",
            margin: "0 0.25rem",
          }}
          key={i}
        />
      ))}
    </>
  );
};

const PlusMinusButton = ({ expanded }: { expanded: boolean }) =>
  expanded ? <Remove /> : <Add />;

const GroupHeader = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.border};
  border-top-radius: 3px;
  padding: 0.25rem;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  align-items: center;
  font-weight: bold;
  color: ${({ theme }) => theme.fontDark};
  background: ${({ theme }) => theme.backgroundTransparent};

  * {
    user-select: none;
  }

  svg {
    font-size: 1.25em;
    vertical-align: middle;
  }
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

type GroupEntryProps = {
  pills?: React.ReactNode;
  title: string;
  setValue?: (name: string) => void;
  onDelete?: () => void;
  before?: React.ReactNode;
  expanded: boolean;
} & React.HTMLProps<HTMLDivElement>;

const GroupEntry = React.memo(
  ({
    title,
    pills,
    onDelete,
    setValue,
    before,
    onClick,
    expanded,
  }: GroupEntryProps) => {
    const [localValue, setLocalValue] = useState(() => title);
    useLayoutEffect(() => {
      setLocalValue(title);
    }, [title]);
    const [editing, setEditing] = useState(false);
    const [hovering, setHovering] = useState(false);
    const ref = useRef<HTMLInputElement>();
    const canCommit = useRef(false);

    return (
      <GroupHeader
        title={title}
        onMouseEnter={() => !hovering && setHovering(true)}
        onMouseLeave={() => hovering && setHovering(false)}
        onMouseDown={(event) => {
          editing ? event.stopPropagation() : (canCommit.current = true);
        }}
        onMouseMove={() => (canCommit.current = false)}
        style={{ cursor: "unset" }}
        onMouseUp={(event) => {
          canCommit.current && onClick && onClick(event);
        }}
      >
        {before}
        <GroupInput
          ref={ref}
          maxLength={40}
          value={localValue}
          focus={editing}
          style={{
            flexGrow: 1,
            pointerEvents: editing ? "unset" : "none",
            textOverflow: "ellipsis",
          }}
          onChange={(event) => setLocalValue(event.target.value.toLowerCase())}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setValue(event.target.value);
              setEditing(false);
            }
            if (event.key === "Escape") {
              event.target.blur();
            }
          }}
          onFocus={() => !editing && setEditing(true)}
          onBlur={() => {
            if (editing) {
              setLocalValue(title);
              setEditing(false);
            }
          }}
        />
        {hovering && !editing && setValue && (
          <span title={"Rename group"} style={{ margin: "0 0.25rem" }}>
            <Edit
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
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
          <span title={"Delete group"} style={{ margin: "0 0.25rem" }}>
            <Close
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => onDelete()}
            />
          </span>
        )}
        <span>
          <PlusMinusButton expanded={expanded} />
        </span>
      </GroupHeader>
    );
  }
);

export const TagGroupEntry = React.memo(
  ({ tagKey, modal }: { tagKey: State.TagKey; modal: boolean }) => {
    const [expanded, setExpanded] = useRecoilState(
      groupShown({ name: TAGS[tagKey], modal })
    );
    const { plural } = useRecoilValue(elementNames);
    const name = `${tagKey === State.TagKey.SAMPLE ? plural : "label"} tags`;
    return (
      <GroupEntry
        before={<LocalOffer style={{ marginRight: "0.5rem" }} />}
        title={name.toUpperCase()}
        onClick={() => setExpanded(!expanded)}
        expanded={expanded}
        pills={
          <Pills
            entries={[
              {
                count: useRecoilValue(numMatchedTags({ modal, key: tagKey })),
                onClick: useClearMatched({ modal, tagKey }),
                icon: <Visibility />,
                title: `Clear matched ${name}`,
              },
              {
                count: useRecoilValue(
                  numGroupFieldsActive({ modal, group: TAGS[tagKey] })
                ),
                onClick: useClearActive(modal, TAGS[tagKey]),
                icon: <Check />,
                title: `Clear shown ${name}`,
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

export const PathGroupEntry = React.memo(
  ({
    name,
    modal,
    mutable = true,
  }: {
    name: string;
    modal: boolean;
    mutable?: boolean;
  }) => {
    const [expanded, setExpanded] = useRecoilState(groupShown({ name, modal }));
    const renameGroup = useRenameGroup(modal, name);
    const onDelete = useDeleteGroup(modal, name);
    const empty = useRecoilValue(groupIsEmpty({ modal, group: name }));

    return (
      <GroupEntry
        title={name.toUpperCase()}
        expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        setValue={modal || !mutable ? null : (value) => renameGroup(value)}
        onDelete={!empty ? null : onDelete}
        pills={
          <Pills
            entries={[
              {
                count: useRecoilValue(
                  numGroupFieldsFiltered({ modal, group: name })
                ),
                onClick: useClearFiltered(modal, name),
                icon: <FilterList />,
                title: `Clear ${name} filters`,
              },
              {
                count: useRecoilValue(
                  numGroupFieldsActive({ modal, group: name })
                ),
                onClick: useClearActive(modal, name),
                icon: <Check />,
                title: `Clear shown ${name}`,
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
