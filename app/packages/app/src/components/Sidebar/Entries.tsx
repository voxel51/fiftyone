import React, { ReactNode, useRef, useState } from "react";
import { animated, useSpring } from "@react-spring/web";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { Checkbox, CircularProgress } from "@material-ui/core";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import { useTheme } from "../../utils/hooks";
import { colorMap } from "../../recoil/selectors";

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
      <Header>
        <span>{text}</span>
      </Header>
    </Container>
  );
};

export const Entry = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();
  return (
    <Container
      style={{ color: theme.fontDarkest, background: theme.backgroundLight }}
    >
      {children}
    </Container>
  );
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
    const color = useRecoilValue(colorMap(modal))(path);
    const theme = useTheme();
    const fieldIsFiltered = useRecoilValue(
      filterAtoms.fieldIsFiltered({ path, modal })
    );

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
              path={path}
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
