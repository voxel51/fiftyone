import React, { useRef } from "react";
import { animated } from "react-spring";
import { Checkbox } from "@material-ui/core";
import numeral from "numeral";
import styled from "styled-components";

import { HoverItemDiv, useHighlightHover } from "./utils";
import { useTheme } from "../../utils/hooks";

const CheckboxDiv = animated(styled(HoverItemDiv)`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
`);

const CheckboxContentDiv = styled.div`
  display: flex;
  justify-content: space-between;
  padding-right: 0.5rem;
`;

const CheckboxTextDiv = styled.span`
  display: flex;
  justify-content: center;
  flex-direction: column;
  text-overflow: ellipses;
`;

interface CheckProps {
  name: string;
  count: number;
  onCheck: () => void;
  onSubmit: () => void;
  active: boolean;
  checkmark: CheckState | null;
  edited: boolean;
  setActive: (name: string) => void;
}

const Check = ({
  name,
  count,
  checkmark,
  onCheck,
  onSubmit,
  active,
  setActive,
  edited,
}: CheckProps) => {
  const theme = useTheme();
  const { style, onMouseEnter, onMouseLeave } = useHighlightHover(
    false,
    active
  );
  const ref = useRef<HTMLButtonElement>();

  return (
    <CheckboxDiv
      onMouseEnter={() => {
        setActive(name);
        onMouseEnter();
      }}
      onMouseLeave={onMouseLeave}
      style={style}
      onClick={(e) =>
        !(e.target === ref.current || ref.current.contains(e.target)) &&
        onSubmit()
      }
    >
      <CheckboxContentDiv>
        <Checkbox
          ref={ref}
          indeterminate={checkmark === null}
          onChange={onCheck}
          checked={checkmark === CheckState.ADD || checkmark === null}
          style={{
            color: edited ? theme.brand : theme.fontDark,
            padding: "0 0.5rem 0 0",
          }}
        />
        <CheckboxTextDiv>{name}</CheckboxTextDiv>
      </CheckboxContentDiv>
      <CheckboxTextDiv>
        {count > 0 ? numeral(count).format("0,0") : null}
      </CheckboxTextDiv>
    </CheckboxDiv>
  );
};

export enum CheckState {
  ADD,
  REMOVE,
}

interface CheckerProps {
  items: { [key: string]: number };
  setChange: (name: string, state: CheckState, canSubmit: boolean) => void;
  changes: { [key: string]: CheckState };
  setActive: (name: string) => void;
  count: number;
  active: string;
}

const Checker = ({
  items,
  changes,
  setChange,
  count,
  active,
  setActive,
}: CheckerProps) => {
  return (
    <>
      {Object.entries({ ...items, ...changes })
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, value]) => {
          const submit = (canSubmit) => {
            return () => {
              if (name in items && name in changes) {
                setChange(
                  name,
                  value === CheckState.REMOVE ? null : CheckState.REMOVE,
                  canSubmit
                );
              } else if (name in items) {
                setChange(
                  name,
                  count === items[name] ? CheckState.REMOVE : CheckState.ADD,
                  canSubmit
                );
              } else {
                setChange(
                  name,
                  value === CheckState.ADD ? CheckState.REMOVE : CheckState.ADD,
                  canSubmit
                );
              }
            };
          };
          const c =
            changes[name] === CheckState.ADD
              ? count
              : changes[name] === CheckState.REMOVE
              ? null
              : items[name];
          return (
            <Check
              {...{ name, count: c, active: active === name }}
              onCheck={submit(false)}
              onSubmit={submit(true)}
              checkmark={
                name in changes
                  ? changes[name]
                  : count === items[name]
                  ? CheckState.ADD
                  : null
              }
              edited={name in changes}
              setActive={setActive}
              key={name}
            />
          );
        })}
    </>
  );
};

export default React.memo(Checker);
