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
import React, { useContext, useLayoutEffect, useRef, useState } from "react";
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
import * as viewAtoms from "../../../recoil/view";

import { PillButton } from "../../utils";

import { elementNames } from "../../../recoil/view";
import { RouterContext, useTheme } from "@fiftyone/components";
import { getDatasetName } from "../../../utils/generic";
import Draggable from "./Draggable";
import {
  groupIsEmpty,
  groupShown,
  MATCH_LABEL_TAGS,
  persistGroups,
  sidebarGroup,
  sidebarGroups,
  sidebarGroupsDefinition,
  textFilter,
  validateGroupName,
} from "../../../recoil/sidebar";

const groupLength = selectorFamily<number, { modal: boolean; group: string }>({
  key: "groupLength",
  get:
    (params) =>
    ({ get }) =>
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
  get:
    (params) =>
    ({ get }) => {
      let count = 0;
      const active = new Set(get(filterAtoms.matchedTags(params)));
      const f = get(textFilter(params.modal));

      return [...active].filter((t) => t.includes(f)).length;
    },
});

const numGroupFieldsFiltered = selectorFamily<
  number,
  { modal: boolean; group: string }
>({
  key: "numGroupFieldsFiltered",
  get:
    (params) =>
    ({ get }) => {
      let count = 0;

      let f = null;

      if (params.modal) {
        const labels = get(schemaAtoms.labelPaths({ expanded: false }));
        f = (path) => labels.includes(path);
      }

      for (const path of get(sidebarGroup({ ...params, loadingTags: true }))) {
        if (
          get(filterAtoms.fieldIsFiltered({ path, modal: params.modal })) &&
          (!f || f(path))
        )
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
  get:
    (params) =>
    ({ get }) => {
      let active = get(schemaAtoms.activeFields({ modal: params.modal }));

      let f = null;

      if (params.modal) {
        const labels = get(schemaAtoms.labelPaths({ expanded: false }));
        f = (path) => labels.includes(path);
        active = active.filter((p) => f(p));
      }

      f = get(textFilter(params.modal));

      if (params.group === "tags") {
        return active.filter(
          (p) => p.startsWith("tags.") && p.slice("tags.".length).includes(f)
        ).length;
      }

      if (params.group === "tags") {
        return active.filter(
          (p) =>
            p.startsWith("_label_tags.") &&
            p.slice("_label_tags.".length).includes(f)
        ).length;
      }

      const paths = new Set(
        get(sidebarGroup({ ...params, loadingTags: true }))
      );

      return active.filter((p) => p.includes(f) && paths.has(p)).length;
    },
});

export const replace = {};

export const useRenameGroup = (modal: boolean, group: string) => {
  const context = useContext(RouterContext);

  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (newName: string) => {
        newName = newName.toLowerCase();

        const current = await snapshot.getPromise(
          sidebarGroupsDefinition(modal)
        );
        if (
          !validateGroupName(
            current.map(([name]) => name).filter((name) => name !== group),
            newName
          )
        ) {
          return false;
        }

        const newGroups = current.map<[string, string[]]>(([name, paths]) => [
          name === group ? newName : name,
          paths,
        ]);

        const view = await snapshot.getPromise(viewAtoms.view);
        const shown = await snapshot.getPromise(
          groupShown({ modal, name: group })
        );

        replace[newName] = group;

        set(groupShown({ name: newName, modal }), shown);
        set(sidebarGroupsDefinition(modal), newGroups);
        !modal && persistGroups(getDatasetName(context), view, newGroups);
        return true;
      },
    []
  );
};

export const useDeleteGroup = (modal: boolean, group: string) => {
  const numFields = useRecoilValue(groupLength({ modal, group }));
  const onDelete = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
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
    ({ set, snapshot }) =>
      async () => {
        const paths = await snapshot.getPromise(
          sidebarGroup({ modal, group, loadingTags: true })
        );
        const active = await snapshot.getPromise(
          schemaAtoms.activeFields({ modal })
        );

        if (group === "tags") {
          set(schemaAtoms.activeTags(modal), []);
          return;
        }

        if (group === "label tags") {
          set(schemaAtoms.activeLabelTags(modal), []);
          return;
        }

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
    ({ set, snapshot }) =>
      async () => {
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
  border-bottom: 2px solid ${({ theme }) => theme.border};
  border-top-radius: 3px;
  margin-left: 2px;
  padding: 3px 3px 3px 8px;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  align-items: center;
  font-weight: bold;
  color: ${({ theme }) => theme.fontDark};
  background: ${({ theme }) => theme.backgroundTransparent};
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
  text-transform: uppercase;
  font-weight: bold;
  color: ${({ theme }) => theme.fontDark};
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
    cb: () => void
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
    const ref = useRef<HTMLInputElement>();
    const canCommit = useRef(false);
    const theme = useTheme();

    return (
      <div
        style={{
          boxShadow: `0 2px 20px ${theme.backgroundDark}`,
        }}
      >
        <div style={{ position: "relative", cursor: "pointer" }}>
          <Draggable color={theme.border} entryKey={entryKey} trigger={trigger}>
            <GroupHeader
              title={title}
              onMouseEnter={() => !hovering && setHovering(true)}
              onMouseLeave={() => hovering && setHovering(false)}
              onMouseDown={(event) => {
                editing ? event.stopPropagation() : (canCommit.current = true);
              }}
              onMouseMove={() => (canCommit.current = false)}
              style={{
                cursor: "unset",
                borderBottomColor: editing ? theme.brand : theme.border,
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
                  if (event.key === "Enter") {
                    setValue(event.target.value).then((success) => {
                      if (!success) {
                        event.target.value = title;
                      }

                      setEditing(false);
                      event.target.blur();
                    });

                    return;
                  }
                  if (event.key === "Escape") {
                    event.target.blur();
                  }
                }}
                onFocus={() => !editing && setEditing(true)}
                onBlur={() => {
                  if (editing) {
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
                        ref.current.setSelectionRange(
                          0,
                          ref.current.value.length
                        );
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
          </Draggable>
        </div>
      </div>
    );
  }
);

export const TagGroupEntry = React.memo(
  ({
    entryKey,
    modal,
    tagKey,
    trigger,
  }: {
    entryKey: string;
    modal: boolean;
    tagKey: State.TagKey;
    trigger: (
      event: React.MouseEvent<HTMLDivElement>,
      key: string,
      cb: () => void
    ) => void;
  }) => {
    const [expanded, setExpanded] = useRecoilState(
      groupShown({ name: TAGS[tagKey], modal })
    );
    const { plural } = useRecoilValue(elementNames);
    const name = `${tagKey === State.TagKey.SAMPLE ? plural : "label"} tags`;

    return (
      <GroupEntry
        before={<LocalOffer style={{ marginRight: "0.5rem" }} />}
        entryKey={entryKey}
        expanded={expanded}
        title={name.toUpperCase()}
        onClick={() => setExpanded(!expanded)}
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
        trigger={trigger}
      />
    );
  }
);

interface PathGroupProps {
  entryKey: string;
  name: string;
  modal: boolean;
  mutable?: boolean;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}

export const PathGroupEntry = React.memo(
  ({ entryKey, name, modal, mutable = true, trigger }: PathGroupProps) => {
    const [expanded, setExpanded] = useRecoilState(groupShown({ name, modal }));
    const renameGroup = useRenameGroup(modal, name);
    const onDelete = !modal ? useDeleteGroup(modal, name) : null;
    const empty = useRecoilValue(groupIsEmpty({ modal, group: name }));

    return (
      <GroupEntry
        entryKey={entryKey}
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
        trigger={trigger}
      />
    );
  }
);
