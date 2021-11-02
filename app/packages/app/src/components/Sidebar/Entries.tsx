import React, { ReactNode, useState } from "react";
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

type GroupEntry = {
  name: string;
};

const GroupEntry = ({ name }) => {};

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
  console.log({
    extended: false,
    path,
    modal,
    ftype,
    embeddedDocType,
  });
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
  vertical-align: middle;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  margin: 3px 0;
  padding: 3px;
  border-radius: 2px;

  & > * {
    margin: 0 6px;
  }
`);

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
      <span>{text}</span>
    </Container>
  );
};

type PathEntryProps = {
  name?: string;
  path: string;
  modal: boolean;
  disabled: boolean;
  children?: ReactNode;
  ftype?: string | string[];
  embeddedDocType?: string | string[];
};

export const PathEntry = React.memo(
  ({
    children,
    disabled,
    modal,
    path,
    name,
    ftype,
    embeddedDocType,
  }: PathEntryProps) => {
    if (!name) {
      name = path;
    }
    const [active, setActive] = useRecoilState(
      schemaAtoms.activeField({ modal, path })
    );
    const color = useRecoilValue(colorMap(modal))(path);
    const theme = useTheme();
    const fieldIsFiltered = useRecoilValue(
      filterAtoms.fieldIsFiltered({ path, modal })
    );

    const containerProps = useSpring({
      backgroundColor: fieldIsFiltered ? "#6C757D" : theme.backgroundLight,
      cursor: disabled ? "unset" : "pointer",
    });

    return (
      <Container onClick={() => setActive(!active)} style={containerProps}>
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
            path={path}
            modal={modal}
            ftype={ftype}
            embeddedDocType={embeddedDocType}
          />
        }
        {children}
      </Container>
    );
  }
);
