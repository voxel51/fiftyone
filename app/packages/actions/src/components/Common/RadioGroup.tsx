import { RadioGroup as Radios, type RadioProps } from "@voxel51/voodo";
import React, { useLayoutEffect } from "react";
import styles from "./RadioGroup.module.css";

interface RadioGroupProps {
  choices: string[];
  setValue: (value: string) => void;
  value: string;
  horizontal?: boolean;
}

/** One of a list of values; the first is chosen when none is. */
const RadioGroup = React.memo(
  ({ choices, value, setValue, horizontal = false }: RadioGroupProps) => {
    useLayoutEffect(() => {
      choices.length >= 1 && !value && setValue(choices[0]);
    }, [value, choices]);

    if (!value) {
      return null;
    }

    return (
      <Radios
        className={horizontal ? styles.horizontal : styles.vertical}
        options={choices.map((choice) => ({
          label: choice,
          value: choice,
          // the row holds the radio, which e2e reads from it
          fieldProps: {
            "data-cy": `radio-button-${choice}`,
          } as RadioProps["fieldProps"],
        }))}
        value={value}
        onChange={setValue}
      />
    );
  },
);

export default RadioGroup;
