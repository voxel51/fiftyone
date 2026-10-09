import {
  CheckIcon,
  CloseIcon,
  cssVar,
  EditIcon,
  FilterListIcon,
  KeyboardArrowDownIcon,
  KeyboardArrowRightIcon,
  VisibilityIcon,
} from "@voxel51/voodo";
import * as fos from "@fiftyone/state";
import {
  useClearActive,
  useClearFiltered,
  useClearVisibility,
  useDeleteGroup,
  useRenameGroup,
} from "@fiftyone/state/src/hooks/useGroupEntries";
import {
  numGroupFieldsActive,
  numGroupFieldsFiltered,
  numGroupFieldsVisible,
} from "@fiftyone/state/src/atoms/groupEntries";
import React, { useRef, useState } from "react";
import {
  SetterOrUpdater,
  useReverbStateLoadable,
  useReverbValue,
  useReverbValueLoadable,
  useSetReverbState,
} from "@fiftyone/reverb";
import styled from "styled-components";
import { FILTER_SPACING } from "../../Filters/styles";
import CountPill from "./CountPill";
import Draggable from "./Draggable";

type PillEntry = React.ComponentProps<typeof CountPill>;

const Pills = ({ entries }: { entries: PillEntry[] }) => (
  <>
    {entries.map((entry, i) => (
      <CountPill key={i} {...entry} />
    ))}
  </>
);

const PlusMinusButton = ({ expanded }: { expanded: boolean }) =>
  expanded ? (
    <KeyboardArrowDownIcon size={16} />
  ) : (
    <KeyboardArrowRightIcon size={16} />
  );

const GroupHeader = styled.div`
  border-bottom: 2px solid ${cssVar.color.border.default};
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  margin-left: 2px;
  padding: 3px 3px 3px calc(${FILTER_SPACING.entryLeft} - 2px);
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  align-items: center;
  font-weight: bold;
  color: ${cssVar.color.text.secondary};
  background: transparent;
  user-select: text;

  svg {
    font-size: 1.25em;
    vertical-align: middle;
  }
  cursor: pointer;
`;

const GroupInput = styled.input`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-weight: bold;
  color: ${cssVar.color.text.secondary};
`;

type GroupEntryProps = {
  entryKey: string;
  pills?: React.ReactNode;
  title: string;
  setValue?: (name: string) => Promise<boolean>;
  onDelete?: () => void;
  before?: React.ReactNode;
  expanded: boolean;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void,
  ) => void;
} & React.HTMLProps<HTMLDivElement>;

const GroupEntry = React.memo(
  ({
    entryKey,
    title,
    pills,
    onDelete,
    setValue,
    before,
    onClick,
    expanded,
    trigger,
  }: GroupEntryProps) => {
    const [editing, setEditing] = useState(false);
    const [hovering, setHovering] = useState(false);
    const ref = useRef<HTMLInputElement>(null);
    const canCommit = useRef(false);
    const setErrors = useSetReverbState(fos.snackbarErrors);
    const canModifySidebarGroup = useReverbValue(fos.canModifySidebarGroup);
    const disabled = canModifySidebarGroup.enabled !== true;

    return (
      <div
        data-cy={`sidebar-group-entry-${title.toUpperCase()}`}
        style={{
          boxShadow: `0 2px 20px ${cssVar.color.scrim.light}`,
        }}
      >
        <div style={{ position: "relative", cursor: "pointer" }}>
          <Draggable
            color={cssVar.color.border.default}
            entryKey={entryKey}
            trigger={trigger}
          >
            <GroupHeader
              title={title}
              data-cy={`sidebar-group-${title.toUpperCase()}`}
              onMouseEnter={() => !hovering && setHovering(true)}
              onMouseLeave={() => hovering && setHovering(false)}
              onMouseDown={(event) => {
                editing ? event.stopPropagation() : (canCommit.current = true);
              }}
              onMouseMove={() => (canCommit.current = false)}
              style={{
                cursor: "unset",
                borderBottomColor: editing
                  ? cssVar.color.brand.primary
                  : cssVar.color.border.default,
              }}
              onMouseUp={(event) => {
                canCommit.current && onClick && onClick(event);
              }}
            >
              {before}
              <GroupInput
                ref={ref}
                maxLength={40}
                style={{
                  flexGrow: 1,
                  pointerEvents: editing ? "unset" : "none",
                  textOverflow: "ellipsis",
                }}
                defaultValue={title}
                onKeyDown={(event) => {
                  const inputElem = event.target as HTMLInputElement;
                  const updatedTitle = inputElem.value;
                  const unchanged = updatedTitle === title;
                  if (event.key === "Enter") {
                    if (unchanged) {
                      return inputElem.blur();
                    }
                    setValue?.(updatedTitle).then((success) => {
                      if (!success) {
                        inputElem.value = title;
                        setErrors(["Failed to rename the group"]);
                      }
                      inputElem.blur();
                    });

                    return;
                  }
                  if (event.key === "Escape") {
                    inputElem.blur();
                  }
                }}
                onFocus={() => !editing && setEditing(true)}
                onBlur={() => {
                  if (editing) {
                    setEditing(false);
                  }
                }}
              />
              {hovering && !editing && setValue && !disabled && (
                <span
                  title={"Rename group"}
                  style={{ margin: "0 0.25rem", display: "flex" }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    setEditing(true);
                    if (ref.current) {
                      ref.current.setSelectionRange(
                        0,
                        ref.current.value.length,
                      );
                      ref.current.focus();
                    }
                  }}
                >
                  <EditIcon size={16} />
                </span>
              )}
              {pills}
              {onDelete && !editing && !disabled && (
                <span
                  title={"Delete group"}
                  style={{ margin: "0 0.25rem", display: "flex" }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => onDelete()}
                >
                  <CloseIcon size={16} />
                </span>
              )}
              <span>
                <PlusMinusButton expanded={expanded} />
              </span>
            </GroupHeader>
          </Draggable>
        </div>
      </div>
    );
  },
);

const useShown = (
  key: string,
  modal: boolean,
): [boolean, SetterOrUpdater<boolean>] => {
  const expanded = useReverbValueLoadable(
    fos.groupShown({ group: key, modal, loading: false }),
  );
  const [expandedLoading, setExpanded] = useReverbStateLoadable(
    fos.groupShown({ group: key, modal, loading: true }),
  );

  if (expanded.state === "hasValue") {
    return [expanded.contents, setExpanded];
  }

  if (expandedLoading.state !== "hasValue") {
    throw new Error(expandedLoading.contents);
  }
  return [expandedLoading.contents, setExpanded];
};

interface PathGroupProps {
  entryKey: string;
  name: string;
  modal: boolean;
  mutable?: boolean;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void,
  ) => void;
}

export const PathGroupEntry = React.memo(
  ({ entryKey, name, modal, mutable = true, trigger }: PathGroupProps) => {
    const [expanded, setExpanded] = useShown(name, modal);
    const renameGroup = useRenameGroup(!modal && mutable, name);
    const onDelete = useDeleteGroup(!modal && mutable, name);

    return (
      <GroupEntry
        entryKey={entryKey}
        title={name}
        expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        setValue={renameGroup}
        onDelete={onDelete}
        pills={
          <Pills
            entries={[
              {
                count: useReverbValue(
                  numGroupFieldsFiltered({ modal, group: name }),
                ),
                dataCy: `clear-filters-${name}`,
                icon: FilterListIcon,
                onClick: useClearFiltered(modal, name),

                title: `Clear ${name} filters`,
              },
              {
                count: useReverbValue(
                  numGroupFieldsVisible({ modal, group: name }),
                ),
                dataCy: `clear-visibility-${name}`,
                icon: VisibilityIcon,
                onClick: useClearVisibility(modal, name),
                title: `Clear ${name} visibility`,
              },
              {
                count: useReverbValue(
                  numGroupFieldsActive({ modal, group: name }),
                ),
                dataCy: `clear-shown-${name}`,
                icon: CheckIcon,
                onClick: useClearActive(modal, name),
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
        trigger={mutable ? trigger : undefined}
      />
    );
  },
);
