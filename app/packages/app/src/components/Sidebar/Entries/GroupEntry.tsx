import { Check, Close, Edit, FilterList, Visibility } from "@material-ui/icons";
import React, { useLayoutEffect, useRef, useState } from "react";
import {
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";

import { removeKeys } from "@fiftyone/utilities";

import * as filterAtoms from "../../../recoil/filters";
import * as schemaAtoms from "../../../recoil/schema";

import DropdownHandle, {
  DropdownHandleProps,
  PlusMinusButton,
} from "../../DropdownHandle";

import { groupShown, sidebarGroup, sidebarGroups } from "../recoil";
import { Pills } from "../utils";

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

    for (const path of get(sidebarGroup(params))) {
      if (active.has(path)) count++;
    }

    return count;
  },
});

export const useRenameGroup = (modal: boolean, group: string) => {
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

export const useDeleteGroup = (modal: boolean, group: string) => {
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

const useClearMatched = () => {
  const [matchedTags, setMatchedTags] = useRecoilState(
    filterAtoms.matchedTags({ modal, key: "sample" })
  );
  useLayoutEffect(() => {
    const newMatches = new Set<string>();
    matchedTags.forEach((tag) => {
      tags.includes(tag) && newMatches.add(tag);
    });

    newMatches.size !== matchedTags.size && setMatchedTags(newMatches);
  }, [matchedTags, allTags]);
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

const GroupHeader = styled(DropdownHandle)`
  border-radius: 2px;
  border-width: 0 0 1px 0;
  padding: 0.25rem;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  align-items: center;
  color: ${({ theme }) => theme.fontDark};
  background: transparent;
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
} & DropdownHandleProps;

export const GroupEntry = ({
  title,
  icon,
  pills,
  onDelete,
  setValue,
  ...rest
}: GroupEntryProps) => {
  const [localValue, setLocalValue] = useState(() => title);
  useLayoutEffect(() => {
    setLocalValue(title);
  }, [title]);
  const [editing, setEditing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const ref = useRef<HTMLInputElement>();

  return (
    <GroupHeader
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
        onBlur={() => {
          if (editing) {
            setLocalValue(title);
            setEditing(false);
          }
        }}
      />
      {hovering && !editing && setValue && (
        <span title={"Rename group"}>
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
        <span title={"Delete group"}>
          <Close
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => onDelete()}
          />
        </span>
      )}
    </GroupHeader>
  );
};

export const TagGroupEntry = React.memo(
  ({ name, modal }: { name: string; modal: boolean }) => {
    const [expanded, setExpanded] = useRecoilState(groupShown({ name, modal }));

    return (
      <GroupHeader
        title={name}
        onClick={() => setExpanded(!expanded)}
        expanded={expanded}
        pills={
          <Pills
            entries={[
              {
                count: useRecoilValue(
                  numGroupTagsMatched({ modal, group: name })
                ),
                onClick: useClearMatched(modal, name),
                icon: <Visibility />,
                title: "Clear matched",
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

export const PathGroupEntry = React.memo(
  ({ name, modal }: { name: string; modal: boolean }) => {
    const [expanded, setExpanded] = useRecoilState(groupShown({ name, modal }));
    const renameGroup = useRenameGroup(modal, name);
    const onDelete = useDeleteGroup(modal, name);

    return (
      <GroupHeader
        title={name}
        expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        setValue={modal ? null : (value) => renameGroup(value)}
        onDelete={modal ? null : onDelete}
        pills={
          <Pills
            entries={[
              {
                count: useRecoilValue(
                  numGroupFieldsFiltered({ modal, group: name })
                ),
                onClick: useClearFiltered(modal, name),
                icon: <FilterList />,
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
