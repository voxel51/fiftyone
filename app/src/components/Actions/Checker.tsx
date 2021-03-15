import React from "react";
import { Checkbox } from "@material-ui/core";
import styled from "styled-components";

import { HoverItemDiv, useHighlightHover } from "./utils";
import { useTheme } from "../../utils/hooks";

const CheckboxDiv = styled(HoverItemDiv)`
  display: flex;
  justify-content: space-between;
`;

interface CheckProps {
  name: string;
  count: number;
  onCheck: () => void;
  onSubmit: () => void;
  active: boolean;
  checkmark: CheckState | null;
  edited: boolean;
}

const Check = ({
  name,
  count,
  onCheck,
  onSubmit,
  active,
  edited,
}: CheckProps) => {
  const theme = useTheme();
  const props = useHighlightHover(false, active);
  return (
    <CheckboxDiv style={props} onClick={onSubmit}>
      <div>
        <Checkbox
          onChange={onCheck}
          style={{ color: edited ? theme.brand : theme.fontDark }}
        />
        {name}
      </div>
      <span>{count}</span>
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
  count: number;
  active: string;
}

const Checker = ({
  items,
  changes,
  setChange,
  count,
  active,
}: CheckerProps) => {
  return (
    <>
      {Object.entries({ ...items, ...changes }).map(([name, value]) => {
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
              changes[name]
                ? changes[name]
                : count === items[name]
                ? CheckState.ADD
                : null
            }
            edited={name in changes}
            key={name}
          />
        );
      })}
    </>
  );
};

export default React.memo(Checker);
