import React, { ReactNode, useRef } from "react";
import { animated, useSpring } from "@react-spring/web";
import {
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";
import { Checkbox, CircularProgress } from "@material-ui/core";

import { removeKeys } from "@fiftyone/utilities";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as colorAtoms from "../../recoil/color";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import { useTheme } from "../../utils/hooks";
import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../Filters";
import { Pills } from "./utils";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
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
import DropdownHandle, {
  DropdownHandleProps,
  PlusMinusButton,
} from "../DropdownHandle";

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

const AddGroupDiv = styled.div`
  box-sizing: border-box;
  background-color: transparent;
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

const AddGridGroup = () => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(false));

  return (
    <AddGroup
      onSubmit={(name) => {
        const newEntries = [...entries];
        newEntries.splice(entries.length - 1, 0, {
          kind: EntryKind.GROUP,
          name,
        });

        setEntries(newEntries);
      }}
      modal={false}
    />
  );
};

const EntryCounts = ({
  path,
  modal,
  ftype,
  embeddedDocType,
}: {
  path: string;
  modal: boolean;
  ftype?: string | string[];
  embeddedDocType?: string | string[];
}) => {
  const theme = useTheme();
  const count = useRecoilValue(
    aggregationAtoms.count({
      extended: false,
      path,
      modal,
      ftype,
      embeddedDocType,
    })
  );
  const subCount = useRecoilValue(
    aggregationAtoms.count({
      extended: true,
      path,
      modal,
      ftype,
      embeddedDocType,
    })
  );

  if (typeof count !== "number") {
    return (
      <CircularProgress
        style={{
          color: theme.font,
          height: 16,
          width: 16,
          minWidth: 16,
        }}
      />
    );
  }

  return <span>{count.toLocaleString()}</span>;
};

const Container = animated(styled.div`
  position: relative;
  overflow: visible;
  justify-content: space-between;
  padding: 3px;
  border-radius: 2px;
  user-select: none;
`);

const Header = styled.div`
  vertical-align: middle;
  display: flex;
  font-weight: bold;

  & > * {
    margin: 0 6px;
  }
`;

type PathValueProps = {
  path: string;
  value: string;
};

const PathValueEntry = ({ path, value }: PathValueProps) => {
  return (
    <div>
      {path}
      {value}
    </div>
  );
};

export const TextEntry = ({ text }: { text: string }) => {
  const theme = useTheme();
  return (
    <Container
      style={{ color: theme.fontDarkest, background: theme.backgroundLight }}
      title={text}
    >
      <Header>
        <span>{text}</span>
      </Header>
    </Container>
  );
};

export const Entry = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();
  return (
    <Container
      style={{ color: theme.fontDarkest, background: theme.backgroundLight }}
    >
      {children}
    </Container>
  );
};

type PathEntryProps = {
  name?: string;
  path: string;
  modal: boolean;
  disabled: boolean;
  pills?: ReactNode;
  children?: ReactNode;
  ftype?: string | string[];
  embeddedDocType?: string | string[];
  style?: React.CSSProperties;
};

export const PathEntry = React.memo(
  ({
    children,
    pills,
    disabled,
    modal,
    path,
    name,
    ftype,
    embeddedDocType,
    style,
  }: PathEntryProps) => {
    if (!name) {
      name = path;
    }
    const [active, setActive] = useRecoilState(
      schemaAtoms.activeField({ modal, path })
    );
    const canCommit = useRef(false);
    const color = useRecoilValue(colorAtoms.pathColor({ path, modal }));
    const theme = useTheme();
    const fieldIsFiltered = useRecoilValue(
      filterAtoms.fieldIsFiltered({ path, modal })
    );
    const expandedPath = useRecoilValue(schemaAtoms.expandPath(path));

    const containerProps = useSpring({
      backgroundColor: fieldIsFiltered ? "#6C757D" : theme.backgroundLight,
    });

    return (
      <Container
        onMouseDown={() => (canCommit.current = true)}
        onMouseMove={() => (canCommit.current = false)}
        onMouseUp={() => canCommit.current && setActive(!active)}
        style={{ ...containerProps, ...style }}
      >
        <Header>
          {!disabled && (
            <Checkbox
              disableRipple={true}
              checked={active}
              title={`Show ${name}`}
              onMouseDown={null}
              style={{
                color: active
                  ? color
                  : disabled
                  ? theme.fontDarkest
                  : theme.fontDark,
                padding: 0,
              }}
            />
          )}
          <span style={{ flexGrow: 1 }}>{name}</span>
          {
            <EntryCounts
              path={expandedPath}
              modal={modal}
              ftype={ftype}
              embeddedDocType={embeddedDocType}
            />
          }
          {pills}
        </Header>
        {children}
      </Container>
    );
  }
);

const FILTERS = {
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

  return fields
    .filter(({ name }) => !label || name !== "tags")
    .map(({ ftype, subfield, name }) => ({
      path: [path, name].join("."),
      modal,
      ftype: ftype === LIST_FIELD ? subfield : ftype,
      named: true,
    }));
};

const FilterEntry = React.memo(
  ({
    modal,
    path,
    onFocus,
    onBlur,
  }: {
    modal: boolean;
    path: string;
    group: string;
    onFocus?: () => void;
    onBlur?: () => void;
  }) => {
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
                onFocus,
                onBlur,
                ...props,
              })
            )
          : null}
      </PathEntryComponent>
    );
  }
);

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
