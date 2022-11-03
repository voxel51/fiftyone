import React, { Suspense, useLayoutEffect, useMemo } from "react";
import { Checkbox } from "@mui/material";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  VisibilityOff,
} from "@mui/icons-material";
import { useSpring } from "@react-spring/web";
import {
  atomFamily,
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";

import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DETECTION,
  DETECTIONS,
  Field,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  KEYPOINTS,
  LABELS,
  LABELS_PATH,
  LIST_FIELD,
  meetsFieldType,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_KEYPOINTS,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";

import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../../Filters";

import { PathEntryCounts } from "./EntryCounts";
import RegularEntry from "./RegularEntry";
import { NameAndCountContainer, PillButton } from "../../utils";
import { useTheme, InfoIcon, Theme } from "@fiftyone/components";
import { KeypointSkeleton } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
<<<<<<< HEAD
import Color from "color";
=======
import styled from 'styled-components';
import ExternalLink from "@fiftyone/components/src/components/ExternalLink";
>>>>>>> beb5a3bca (initial field app info)

const canExpand = selectorFamily<boolean, { path: string; modal: boolean }>({
  key: "sidebarCanExpand",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      return get(fos.count({ path, extended: false, modal })) > 0;
    },
});

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

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
};

const getFilterData = (
  path: string,
  modal: boolean,
  parent: Field,
  fields: Field[],
  skeleton: (field: string) => KeypointSkeleton | null
): {
  ftype: string;
  path: string;
  modal: boolean;
  named?: boolean;
  listField: boolean;
}[] => {
  if (!parent) {
    return [];
  }

  if (meetsFieldType(parent, { ftype: VALID_PRIMITIVE_TYPES })) {
    let ftype = parent.ftype;
    const listField = ftype === LIST_FIELD;
    if (listField) {
      ftype = parent.subfield;
    }

    return [
      {
        ftype,
        path,
        modal,
        named: false,
        listField,
      },
    ];
  }

  const label = LABELS.includes(parent.embeddedDocType);
  const excluded = EXCLUDED[parent.embeddedDocType] || [];

  const extra: {
    ftype: string;
    path: string;
    modal: boolean;
    named?: boolean;
    listField: boolean;
  }[] = [];

  if (VALID_KEYPOINTS.includes(parent.embeddedDocType)) {
    let p = path;
    if (withPath(LABELS_PATH, KEYPOINTS) === parent.embeddedDocType) {
      p = path.split(".").slice(0, -1).join(".");
    }

    if (skeleton(p)) {
      extra.push({
        path: [path, "points"].join("."),
        modal,
        named: true,
        ftype: STRING_FIELD,
        listField: false,
      });
    }
  }

  return fields
    .filter(({ name, ftype, subfield }) => {
      if (ftype === LIST_FIELD) {
        ftype = subfield;
      }

      return (
        !label ||
        (name !== "tags" &&
          !excluded.includes(name) &&
          VALID_PRIMITIVE_TYPES.includes(ftype))
      );
    })
    .map(({ ftype, subfield, name }) => {
      const listField = ftype === LIST_FIELD;

      if (listField) {
        ftype = subfield;
      }

      return {
        path: [path, name].join("."),
        modal,
        ftype,
        named: true,
        listField,
      };
    })
    .concat(extra);
};

const hiddenPathLabels = selectorFamily<string[], string>({
  key: "hiddenPathLabels",
  get:
    (path) =>
    ({ get }) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modal).sample._id;

      if (data[sampleId]) {
        return data[sampleId][path] || [];
      }

      return [];
    },
  set:
    (path) =>
    ({ set, get }, value) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modal).sample._id;

      set(fos.pathHiddenLabelsMap, {
        ...data,
        [sampleId]: {
          ...data[sampleId],
          [path]: value instanceof DefaultValue ? [] : value,
        },
      });
    },
});

const useHidden = (path: string) => {
  const [hidden, set] = useRecoilState(hiddenPathLabels(path));

  const num = hidden.length;

  return num ? (
    <PillButton
      text={num.toLocaleString()}
      icon={<VisibilityOff />}
      onClick={() => set([])}
      open={false}
      highlight={false}
      style={{
        height: "1.5rem",
        lineHeight: "1rem",
        padding: "0.25rem 0.5rem",
        margin: "0 0.5rem",
      }}
    />
  ) : null;
};

const pathIsExpanded = atomFamily<boolean, { modal: boolean; path: string }>({
  key: "pathIsExpanded",
  default: false,
});

const FilterableEntry = React.memo(
  ({
    entryKey,
    modal,
    path,
    onFocus,
    onBlur,
    disabled = false,
    trigger,
  }: {
    disabled?: boolean;
    entryKey: string;
    group: string;
    modal: boolean;
    path: string;
    onFocus?: () => void;
    onBlur?: () => void;
    trigger: (
      event: React.MouseEvent<HTMLDivElement>,
      key: string,
      cb: () => void
    ) => void;
  }) => {
    const [expanded, setExpanded] = useRecoilState(
      pathIsExpanded({ modal, path })
    );
    const theme = useTheme();
    const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;
    const skeleton = useRecoilValue(fos.getSkeleton);
    const expandedPath = useRecoilValue(fos.expandPath(path));
    const color = disabled
      ? theme.background.level2
      : useRecoilValue(fos.pathColor({ path, modal }));
    const fields = useRecoilValue(
      fos.fields({
        path: expandedPath,
        ftype: VALID_PRIMITIVE_TYPES,
      })
    );

    const field = useRecoilValue(fos.field(path));
    const data = useMemo(
      () => getFilterData(expandedPath, modal, field, fields, skeleton),
      [field, fields, expandedPath, modal, skeleton]
    );
    const fieldIsFiltered = useRecoilValue(
      fos.fieldIsFiltered({ path, modal })
    );
    const [active, setActive] = useRecoilState(
      fos.activeField({ modal, path })
    );
    const expandable = useRecoilValueLoadable(canExpand({ modal, path }));
    const hidden = modal ? useHidden(path) : null;

    useLayoutEffect(() => {
      if (expandable.state !== "loading" && !expandable.contents && expanded) {
        setExpanded(false);
      }
    }, [expandable.state, expandable.contents, expanded]);

    if (!field) {
      return null;
    }
    
    const entryInfo = useEntryInfo(field, {color, expandedPath});

    return (
      <RegularEntry
        backgroundColor={
          fieldIsFiltered
            ? Color(color).alpha(0.25).string()
            : theme.background.level1
        }
        color={color}
        entryKey={entryKey}
        heading={
          <>
            {!disabled && (
              <Checkbox
                disableRipple={true}
                checked={active}
                title={`Show ${path}`}
                style={{
                  color: active ? color : theme.text.secondary,
                  marginLeft: 2,
                  padding: 0,
                }}
                key="checkbox"
              />
            )}
            <NameAndCountContainer {...entryInfo.iconContainerMouseEvents} ref={entryInfo.target}>
              <span key="path">
                {path}
              </span>
              {entryInfo.isVisible && <EntryInfo {...entryInfo}  />}
              {hidden}
              <PathEntryCounts key="count" modal={modal} path={expandedPath} />
              
              {!disabled &&
                expandable.state !== "loading" &&
                expandable.contents && (
                  <Arrow
                    key="arrow"
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
                )}
            </NameAndCountContainer>
          </>
        }
        onClick={!disabled ? () => setActive(!active) : null}
        trigger={trigger}
      >
        <Suspense fallback={null}>
          {expanded &&
            data.map(({ ftype, listField, ...props }) => {
              return React.createElement(FILTERS[ftype], {
                key: props.path,
                onFocus,
                onBlur,
                title: listField ? `${LIST_FIELD}(${ftype})` : ftype,
                ...props,
              });
            })}
        </Suspense>
      </RegularEntry>
    );
  }
);

function useEntryInfo(field, {expandedPath, color}) {
  const target = useRef();
  const [open, setOpen] = useState(false);
  const timer = useRef();
  const [isVisible, setVisible] = useState(false);

  return {
    isVisible,
    open,
    iconMouseEvents: {
      onMouseOver() {
        setOpen(true);
        setVisible(true);
      },
      onMouseOut() {
        setOpen(false);
      },
    },
    iconContainerMouseEvents: {
      onMouseOver() {
        timer.current = setTimeout(() => setVisible(true), 1000);
      },
      onMouseOut() {
        if (timer.current) clearTimeout(timer.current);
        setVisible(false);
      },
    },
    target,
    field,
    expandedPath,
    color,
  }
}

function EntryInfo({open, iconMouseEvents, matched, ...props}) {
  const theme = useTheme();
  const color = theme.font // : theme.fontDark;
  return (
    <>
      <InfoIcon className='entryInfoIcon' style={{color}} {...iconMouseEvents} />
      {open && <EntryInfoExpanded {...props} />}
    </>
  );
}

const EntryInfoExpandedContainer = styled.div`
  background: ${({ theme }) => theme.backgroundLight};
  border: 1px solid ${({ theme }) => theme.backgroundDark};
  // border-radius: 5px;
  padding: 0 0.5rem 0.5rem 0.5rem;
  box-shadow: 0 0 5px ${({ theme }) => theme.backgroundDark};
  border-left: 3px solid ${({color}) => color};
`
const EntryInfoTitle = styled.div`
  font-weight: bold;
  margin-top: -24px;
  margin-left: -0.7rem;
  > span {
    font-size: 1.2rem;
    display: inline-block;
    background: ${({ theme }) => theme.backgroundLight};
    padding: 0 1rem 0 1rem;
    height: 24px;
    border: 1px solid ${({ theme }) => theme.backgroundDark};
    border-bottom: none;
    border-left: 3px solid ${({color}) => color};
  }
`

const EntryInfoDesc = styled.div`
  font-size: 1rem;
  margin: 0 0.5rem;
`

const EntryInfoHoverTarget = styled.div`
  position: absolute;
  width: 400px;
  padding-left: 1rem;
`

function EntryInfoExpanded({field, target, color, expandedPath}) {
  const el = useRef<HTMLElement>();

  useEffect(() => {
    if (!el.current) return;
    const targetBounds = target.current.getBoundingClientRect();
    const selfBounds = el.current.getBoundingClientRect();
    const top = targetBounds.top - selfBounds.height / 2 + targetBounds.height / 2;
    const left = targetBounds.left + targetBounds.width + 10;
    el.current.style.top = top + 'px';
    el.current.style.left = (left - 16) + 'px';
  }, [field]);
  if (!target.current) return null;

  return ReactDOM.createPortal(
    <EntryInfoHoverTarget ref={el}>
      <EntryInfoExpandedContainer color={color}>
        <EntryInfoTitle color={color}><span>{field.path}</span></EntryInfoTitle>
        {field.description && <EntryInfoDesc>{field.description}</EntryInfoDesc>}
        <EntryInfoTable {...field} type={field.embeddedDocType || field.ftype} expandedPath={expandedPath}  />
      </EntryInfoExpandedContainer>
    </EntryInfoHoverTarget>,
    document.body
  );
}

// a styled.table that uses the theme
// to render a table with alternating
// background colors for rows
// and spaces out the rows and columns
const EntryInfoTableContainer = styled.table`
  border-collapse: collapse;
  width: 100%;
  td,
  th {
    padding: 0.1rem 0.5rem;
    border: 1px solid ${({ theme }) => theme.border};
  }
  tr:nth-child(even) {
    background: ${({ theme }) => theme.backgroundLight};
  }
  tr:nth-child(odd) {
    background: ${({ theme }) => theme.backgroundDark};
  }
`;

// a styled div that displays a count in italics
const EntryCount = styled.div`
  font-size: 0.9rem;
  font-style: italic;
  // margin: 0.5rem 0 0.5rem 0;
`;

function entryKeyToLabel(key) {
  switch (key) {
    case "embeddedDocType":
      return "type";
  }
  return key;
}

// a react componont that renders a table
// given an object where the keys are the first column
// and the values are the second column
function EntryInfoTable({info, type, expandedPath, subfield}) {
  info = info || {}
  const tableData = info;
  const matchingName = type.includes('.labels.') ? 'labels' : 'samples';
  return (
    <EntryInfoTableContainer>
      <tbody>
        <tr>
          <td>count</td>
          <td><EntryCount>found <PathEntryCounts key="count" path={expandedPath} /> {matchingName}</EntryCount></td>
        </tr>
        {type && <tr>
          <td>type</td>
          <td><LinkToType type={type} subfield={subfield} /></td>
        </tr>}
        {Object.entries(tableData).filter(keyValueIsRenderable).map(([key, value]) => (
          <tr key={key}>
            <td>{entryKeyToLabel(key)}</td>
            <td><LinkOrValue value={value} /></td>
          </tr>
        ))}
      </tbody>
    </EntryInfoTableContainer>
  );
}

function keyValueIsRenderable([key, value]) {
  if (value === undefined || value === null )
    return true;

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return true;
    default:
      return false;
  }
}
    


function convertTypeToDocLink(type) {
  const parts = type.split(".");
  const modulePath = [];
  let className = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partLower = part.toLowerCase();
    if (partLower !== part) {
      className = part;
    } else {
      modulePath.push(part);
    }
  }
  const fullPath = [...modulePath, className].join(".");

  const BASE = 'https://voxel51.com/docs/fiftyone/api/'
  
  if (className) {
    return {
      href: `${BASE}${modulePath.join('.')}.html#${fullPath}`,
      label: className
    }
  }
  return {
    href: `${BASE}${modulePath.join('.')}.html`,
    label: modulePath.join('.')
  }
}

function LinkToType({type, subfield}) {
  const theme = useTheme();
  const {href, label} = convertTypeToDocLink(type);
  return (
    <ExternalLink style={{color: theme.font}} href={href}>
      {label} {subfield ? `(${subfield})` : null}
    </ExternalLink>
  )
}

// a react component that returns a link
// if the given value is a string that is a valid url
// otherwise it returns the value
function LinkOrValue({value}) {
  const theme = useTheme();
  if (typeof value !== 'string') return value;
  if (!value.startsWith('http')) return value;
  return <ExternalLink style={{color: theme.font}} href={value}>{value}</ExternalLink>
}

export default React.memo(FilterableEntry);
