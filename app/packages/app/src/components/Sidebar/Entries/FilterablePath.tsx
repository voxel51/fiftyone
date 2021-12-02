import React, { ReactNode } from "react";
import { CircularProgress } from "@material-ui/core";
import { animated } from "@react-spring/web";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import * as aggregationAtoms from "../../../recoil/aggregations";
import * as colorAtoms from "../../../recoil/color";
import * as filterAtoms from "../../../recoil/filters";
import * as schemaAtoms from "../../../recoil/schema";

import { useTheme } from "../../../utils/hooks";

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
