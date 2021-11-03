import { Visibility } from "@material-ui/icons";
import React, { ReactNode } from "react";
import styled from "styled-components";
import { useTheme } from "../../utils/hooks";

import { PillButton } from "../utils";

export type PillEntry = {
  onClick: () => void;
  active: string[];
  title: string;
  icon?: ReactNode;
};

export const usePills = (entries: PillEntry[]): JSX.Element[] => {
  const theme = useTheme();

  return entries.map((data) => (
    <PillButton
      {...data}
      text={`${data.active.length}`}
      highlight={false}
      open={false}
      style={{
        height: "1.5rem",
        fontSize: "0.8rem",
        lineHeight: "1rem",
        color: theme.font,
      }}
    />
  ));
};

type MatchEyeProps = {
  name: string;
  elementsName: string;
  onClick: () => void;
  matched: Set<string>;
};

export const MatchEye = ({
  elementsName,
  name,
  matched,
  onClick,
}: MatchEyeProps) => {
  const theme = useTheme();
  const color = matched.has(name) ? theme.font : theme.fontDark;
  const title = `Only show ${elementsName} with the "${name}" tag ${
    matched.size ? "or other selected tags" : ""
  }`;

  return (
    <span
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Visibility
        style={{
          color,
          height: 20,
          width: 20,
        }}
      />
    </span>
  );
};
