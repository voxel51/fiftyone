import React, { useState } from "react";
import { animated, useSpring } from "react-spring";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import {
  Checkbox,
  CircularProgress,
  FormControlLabel,
} from "@material-ui/core";
import { ArrowDropDown, ArrowDropUp } from "@material-ui/icons";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import { useTheme } from "../../utils/hooks";
import { colorMap } from "../../recoil/selectors";

const EntryCounts = ({ path, modal }: { path: string; modal: boolean }) => {
  const theme = useTheme();
  const count = useRecoilValue(
    aggregationAtoms.count({ extended: false, path, modal })
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

const PathValueEntry = React.memo({});

type PathEntryProps = {
  name?: string;
  path: string;
  modal: boolean;
  disabled: boolean;
};

const Container = animated(styled.div`
  position: relative;
  overflow: visible;
`);

export const PathEntry = React.memo(
  ({ disabled, modal, path, name }: PathEntryProps) => {
    if (!name) {
      name = path;
    }

    const [expanded, setExpanded] = useState(false);
    const [active, setActive] = useRecoilState(
      schemaAtoms.activeField({ modal, path })
    );
    const color = useRecoilValue(colorMap(modal))(path);
    const theme = useTheme();
    const fieldFiltered = useRecoilValue(
      filterAtoms.fieldIsFiltered({ path, modal })
    );

    const checkboxClass = disabled ? "no-checkbox" : "with-checkbox";
    const containerProps = useSpring({
      backgroundColor: fieldFiltered ? "#6C757D" : theme.backgroundLight,
    });

    return (
      <Container style={containerProps}>
        <FormControlLabel
          disabled={disabled}
          label={
            <>
              <span>{name}</span>
              {
                <CheckboxText
                  path={path}
                  title={name}
                  expanded={expanded}
                  setExpanded={setExpanded}
                />
              }
            </>
          }
          classes={{
            root: checkboxClass,
            label: checkboxClass,
          }}
          style={{
            width: "100%",
            color: active
              ? theme.font
              : disabled
              ? theme.fontDarkest
              : theme.fontDark,
          }}
          control={
            !disabled ? (
              <Checkbox
                disableRipple={true}
                checked={active}
                title={`Show ${name}`}
                onClick={() => setActive(!active)}
                onMouseDown={null}
                style={{
                  color: active
                    ? color
                    : disabled
                    ? theme.fontDarkest
                    : theme.fontDark,
                }}
              />
            ) : null
          }
        />
      </Container>
    );
  }
);
