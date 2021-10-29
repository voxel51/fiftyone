import React, { Suspense, useState } from "react";
import styled from "styled-components";
import { CircularProgress } from "@material-ui/core";
import { ArrowDropDown, ArrowDropUp } from "@material-ui/icons";
import { RecoilValueReadOnly, useRecoilValue } from "recoil";
import { animated, useSpring } from "react-spring";

import { useTheme } from "../../utils/hooks";
import { genSort, prettify } from "../../utils/generic";
import { sortFilterResults } from "../../recoil/atoms";

const Body = styled.div`
  vertical-align: middle;
  font-weight: bold;
  overflow: visible;

  & > div {
    margin-top: 3px;
    margin-left: 0;
    margin-right: 0;
    border-radius: 2px;
  }

  label {
    margin: 0;
    width: 100%;
    height: 32px;
    display: flex;
    justify-content: space-between;

    .MuiTypography-body1 {
      flex: 1;
      font-size: unset;
      align-items: center;
      padding-right: 3px;
      max-width: 100%;
    }

    .MuiTypography-body1.with-checkbox {
      max-width: calc(100% - 36px);
    }
    overflow: "hidden", .MuiCheckbox-root {
      padding: 0;

      .MuiIconButton-label {
        position: relative;
        svg {
          z-index: 2;
        }
      }
    }

    .MuiFormControlLabel-label {
      display: flex;
      font-weight: bold;
      color: unset;
      line-height: 29px;
      height: 29px;
      justify-content; space-between;
      max-width: 100%;

      span {
        white-space: nowrap;
      }

      span.name {
        display: block;
        padding: 0 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
        max-width: 100%;
        line-height: 29px;
        height: 29px;
        align-items: center;
        vertical-align: middle;
      }
      span.count {
        display: block;
        height: 29px;
        line-height: 29px;
        vertical-align: middle;
        max-width: 100%;
      }

      span.data {
        display: block;
        margin-left: 0.5em;
        line-height: 29px;
        display: flex;
        vertical-align: middle;
        align-items: center;
      }
    }
  }

  && .Mui-disabled {
    cursor: not-allowed;
    color: ${({ theme }) => theme.fontDarkest};

    svg,
    input[type="checkbox"] {
      display: none;
    }
  }

  && .no-checkbox {
    cursor: default;
  }
`;

const CheckboxContainer = animated(styled.div`
  position: relative;
  overflow: visible;
`);

const CheckboxText = ({
  count,
  subCountAtom,
  value,
  title,
  path,
  hasDropdown,
  expanded,
  setExpanded,
}: {
  title: string;
  count?: number;
  value?: any;
  subCountAtom?: RecoilValueReadOnly<{ [key: string]: number }>;
  path: string;
  icon?: any;
  hasDropdown: boolean;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
}) => {
  const theme = useTheme();
  const subCounts = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const subCount = subCounts ? subCounts[path] : null;
  const ArrowType = expanded ? ArrowDropUp : ArrowDropDown;

  if (value || typeof value === "string") {
    return (
      <span className="count" title={title} style={{ marginRight: 4 }}>
        {prettify(value)}
      </span>
    );
  }

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

  return (
    <>
      <span className="count" title={title}>
        {typeof subCount === "number" && subCount !== count
          ? `${subCount.toLocaleString()} of ${count.toLocaleString()}`
          : count.toLocaleString()}
      </span>

      {hasDropdown && count > 0 && (
        <ArrowType
          onClick={(e) => {
            e.preventDefault();
            setExpanded(!expanded);
          }}
          style={{ marginRight: -4, cursor: "pointer" }}
        />
      )}
    </>
  );
};

type EntryProps = {
  entry: Entry;
  modal: boolean;
  onCheck?: (entry: Entry) => void;
};

const Entry = React.memo(({ entry, onCheck, modal }: EntryProps) => {
  let {
    disabled,
    color,
    hasDropdown,
    hideCheckbox,
    name,
    path,
    selected,
    title,
    canFilter,
    type,
    count,
    subCountAtom,
    value,
    icon,
    key,
  } = entry;
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const fieldFiltered =
    useRecoilValue(fieldIsFiltered({ path, modal })) &&
    canFilter &&
    !((isNumeric || isBoolean || isString) && modal);

  const isSupport = useRecoilValue(isSupportField(path));
  hasDropdown = hasDropdown && (!isSupport || !modal);

  const checkboxClass = hideCheckbox ? "no-checkbox" : "with-checkbox";
  const containerProps = useSpring({
    backgroundColor: fieldFiltered ? "#6C757D" : theme.backgroundLight,
  });

  return (
    <CheckboxContainer style={containerProps}>
      <FormControlLabel
        disabled={disabled}
        label={
          <>
            <span
              className="name"
              title={name}
              style={{ marginLeft: hideCheckbox ? 4 : 0 }}
            >
              {name}
            </span>
            {
              <Suspense
                fallback={
                  <CheckboxText
                    path={key ? key : path}
                    value={value}
                    count={count}
                    title={title}
                    hasDropdown={hasDropdown}
                    expanded={expanded}
                    setExpanded={setExpanded}
                  />
                }
              >
                <CheckboxText
                  path={key ? key : path}
                  value={value}
                  subCountAtom={subCountAtom}
                  count={count}
                  title={title}
                  hasDropdown={hasDropdown}
                  expanded={expanded}
                  setExpanded={setExpanded}
                />
              </Suspense>
            }
            {icon ? icon : null}
          </>
        }
        classes={{
          root: checkboxClass,
          label: checkboxClass,
        }}
        style={{
          width: "100%",
          color:
            selected || hideCheckbox
              ? theme.font
              : entry.disabled
              ? theme.fontDarkest
              : theme.fontDark,
        }}
        control={
          <Checkbox
            disableRipple={true}
            checked={selected}
            title={`Show ${name} ${type}`}
            onClick={() => onCheck({ ...entry, selected: !entry.selected })}
            onMouseDown={null}
            style={{
              display: hideCheckbox ? "none" : "block",
              color:
                selected || hideCheckbox
                  ? color
                  : disabled
                  ? theme.fontDarkest
                  : theme.fontDark,
            }}
          />
        }
      />
    </CheckboxContainer>
  );
});

const withSort = (modal: boolean) => {
  const { count, asc } = useRecoilValue(sortFilterResults(modal));

  return (entries) => {
    return entries.sort((aa, bb) => {
      let a = [aa.name, aa.count];
      let b = [bb.name, bb.count];

      if (count) {
        a.reverse();
        b.reverse();
      }

      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result = genSort(a[i], b[i], asc);
        if (result !== 0) {
          return result;
        }
      }

      return result;
    });
  };
};

const CheckboxGroup = React.memo(({ entries, onCheck, modal, sort = true }) => {
  const sorter = withSort(modal);

  if (sort) {
    entries = sorter(entries);
  }

  return (
    <Body>
      {entries.map((entry) => (
        <Entry key={entry.name} entry={entry} onCheck={onCheck} modal={modal} />
      ))}
    </Body>
  );
});

export default CheckboxGroup;
