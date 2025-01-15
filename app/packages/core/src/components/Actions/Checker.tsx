import { Checkbox } from "@mui/material";
import { animated } from "@react-spring/web";
import numeral from "numeral";
import React, { useRef } from "react";
import styled from "styled-components";

import { useTheme } from "@fiftyone/components";
import { useKeydownHandler } from "@fiftyone/state";
import { ItemAction } from "./ItemAction";
import { useHighlightHover } from "./utils";

const CheckboxDiv = animated(styled(ItemAction)`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  margin: 0;
`);

const CheckboxContentDiv = styled.div`
  display: flex;
  justify-content: space-between;
  flex: 1;
  width: calc(100% - 33px);
`;

const CheckboxTextDiv = styled.span`
  display: block;
  white-space: nowrap;
`;

interface CheckProps {
  name: string;
  count: null | number;
  onCheck: () => void;
  active: null | string;
  checkmark: CheckState | null;
  setActive: (name: null | string) => void;
  disabled: boolean;
}

const Check = ({
  name,
  count,
  checkmark,
  onCheck,
  active,
  setActive,
  disabled,
}: CheckProps) => {
  const theme = useTheme();
  const { style, onMouseEnter, onMouseLeave } = useHighlightHover(
    false,
    active === name
  );
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <CheckboxDiv
      onMouseEnter={() => {
        setActive(name);
        onMouseEnter();
      }}
      onMouseLeave={onMouseLeave}
      style={style}
      onClick={(e) =>
        !disabled &&
        !(
          e.target === ref.current || ref.current?.contains(e.target as Node)
        ) &&
        onCheck()
      }
    >
      <Checkbox
        ref={ref}
        indeterminate={checkmark === null}
        disabled={disabled}
        onChange={() => !disabled && onCheck()}
        checked={checkmark === CheckState.ADD || checkmark === null}
        style={{
          color: theme.primary.plainColor,
          padding: "0 0.5rem 0 0",
        }}
      />
      <CheckboxContentDiv title={name}>
        <CheckboxTextDiv
          style={{
            flexGrow: 1,
            maxWidth: "100%",
            paddingRight: "0.5rem",
            textOverflow: "ellipsis",
            overflow: "hidden",
          }}
        >
          {name}
        </CheckboxTextDiv>
        <CheckboxTextDiv>
          {(count ?? 0) > 0 ? numeral(count).format("0,0") : "0"}
        </CheckboxTextDiv>
      </CheckboxContentDiv>
    </CheckboxDiv>
  );
};

export enum CheckState {
  ADD,
  REMOVE,
}

const CheckerDiv = styled.div`
  margin: 0 -0.5rem 0.25rem -0.5rem;
  max-height: 346px;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`;

const createSubmit = ({ name, items, changes, count, setChange, value }) => {
  return () => {
    if (name in items && name in changes) {
      setChange(
        name,
        value === CheckState.REMOVE || items[name] === 0
          ? null
          : CheckState.REMOVE
      );
    } else if (name in items) {
      setChange(
        name,
        count === items[name] ? CheckState.REMOVE : CheckState.ADD
      );
    } else {
      setChange(
        name,
        value === CheckState.ADD
          ? value in items
            ? CheckState.REMOVE
            : null
          : CheckState.ADD
      );
    }
  };
};

interface CheckerProps {
  active: null | string;
  changes: { [key: string]: CheckState };
  clear: () => void;
  count: number;
  disabled: boolean;
  items: { [key: string]: number };
  setActive: (name: null | string) => void;
  setChange: (name: string, state: CheckState, canSubmit: boolean) => void;
}

const Checker = ({
  items,
  changes,
  setChange,
  count,
  active,
  setActive,
  disabled,
  clear,
}: CheckerProps) => {
  const sorted = Object.entries({ ...items, ...changes }).sort(([a], [b]) =>
    a < b ? -1 : 1
  );

  const names = sorted.map(([name]) => name);

  useKeydownHandler((e) => {
    if (names.length === 0) return;
    let index: null | number = null;
    if (e.key === "ArrowDown") {
      index = active === null ? 0 : names.indexOf(active) + 1;
    } else if (e.key === "ArrowUp") {
      index = active === null ? names.length - 1 : names.indexOf(active) - 1;
    }

    if (typeof index === "number") {
      if (index < 0) {
        index = names.length - 1;
      } else if (index > names.length - 1) {
        index = 0;
      }
      setActive(names[index]);
    }

    if (e.key === "Enter" && active?.length) {
      createSubmit({
        name: active,
        changes,
        items,
        count,
        value: sorted.filter(([n]) => n === active)[0][1],
        setChange,
      })();
      clear();
    }
  });

  return (
    <CheckerDiv onMouseLeave={() => setActive(null)}>
      {sorted.map(([name, value]) => {
        const submit = createSubmit({
          name,
          value,
          items,
          changes,
          setChange,
          count,
        });
        const c =
          changes[name] === CheckState.ADD
            ? count
            : changes[name] === CheckState.REMOVE
            ? null
            : items[name];

        return (
          <Check
            {...{ name, count: c, active, disabled }}
            onCheck={submit}
            checkmark={
              name in changes
                ? changes[name]
                : count === items[name]
                ? CheckState.ADD
                : 0 === items[name]
                ? CheckState.REMOVE
                : null
            }
            setActive={setActive}
            key={name}
          />
        );
      })}
    </CheckerDiv>
  );
};

export default React.memo(Checker);
