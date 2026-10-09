import { useKeydownHandler } from "@fiftyone/state";
import { Checkbox, Size, Text, TextColor, TextVariant } from "@voxel51/voodo";
import numeral from "numeral";
import React from "react";
import styles from "./Checker.module.css";

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
}: CheckProps) => (
  <div
    className={[styles.check, active === name ? styles.active : undefined]
      .filter(Boolean)
      .join(" ")}
    title={name}
    onMouseEnter={() => setActive(name)}
    onClick={(event) =>
      // the checkbox reports its own presses
      !disabled &&
      !(event.target as Element).closest("[role=checkbox]") &&
      onCheck()
    }
  >
    <Checkbox
      checked={checkmark === CheckState.ADD || checkmark === null}
      disabled={disabled}
      indeterminate={checkmark === null}
      size={Size.Sm}
      onChange={() => !disabled && onCheck()}
    />
    <Text
      className={styles.name}
      color={TextColor.Primary}
      variant={TextVariant.BodySecondary}
    >
      {name}
    </Text>
    <Text color={TextColor.Secondary} variant={TextVariant.BodySecondary}>
      {(count ?? 0) > 0 ? numeral(count).format("0,0") : "0"}
    </Text>
  </div>
);

export enum CheckState {
  ADD,
  REMOVE,
}

const createSubmit = ({ name, items, changes, count, setChange, value }) => {
  return () => {
    if (name in items && name in changes) {
      setChange(
        name,
        value === CheckState.REMOVE || items[name] === 0
          ? null
          : CheckState.REMOVE,
      );
    } else if (name in items) {
      setChange(
        name,
        count === items[name] ? CheckState.REMOVE : CheckState.ADD,
      );
    } else {
      setChange(
        name,
        value === CheckState.ADD
          ? value in items
            ? CheckState.REMOVE
            : null
          : CheckState.ADD,
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
    a < b ? -1 : 1,
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
    <div className={styles.checker} onMouseLeave={() => setActive(null)}>
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
    </div>
  );
};

export default React.memo(Checker);
