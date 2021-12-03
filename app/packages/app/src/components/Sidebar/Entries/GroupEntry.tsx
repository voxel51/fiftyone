import { Check, Close, Edit, FilterList } from "@material-ui/icons";
import { string } from "prop-types";
import React, { useLayoutEffect, useRef, useState } from "react";
import { selectorFamily, useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import * as filterAtoms from "../../../recoil/filters";
import * as schemaAtoms from "../../../recoil/schema";

import DropdownHandle, {
  DropdownHandleProps,
  PlusMinusButton,
} from "../../DropdownHandle";

import { groupShown, sidebarGroup } from "../recoil";
import { Pills } from "../utils";

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

const GroupHeaderStyled = styled(DropdownHandle)`
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
    </GroupHeaderStyled>
  );
};

export const TagGroupEntry = React.memo(({ name, modal }): {
  name: string;
  modal: boolean;
} => {
  const;
  return <GroupHeader />;
});

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
