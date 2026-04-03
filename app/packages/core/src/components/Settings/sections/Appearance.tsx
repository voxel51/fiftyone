import * as fos from "@fiftyone/state";
import { DarkMode, LightMode } from "@mui/icons-material";
import { useColorScheme } from "@mui/material";
import React from "react";
import { useSetRecoilState } from "recoil";
import styled from "styled-components";
import { GroupLabel, ShortcutGroup } from "../styled";

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
`;

const RowLabel = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.text.secondary};
`;

const ToggleGroup = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: var(--radius-sm);
  overflow: hidden;
`;

const ToggleButton = styled.button<{ $active: boolean }>`
  all: unset;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  font-weight: ${({ $active }) => ($active ? "600" : "400")};
  cursor: pointer;
  background: ${({ $active, theme }) =>
    $active ? theme.primary.plainColor : "transparent"};
  color: ${({ $active, theme }) =>
    $active ? theme.text.buttonHighlight : theme.text.secondary};
  transition: background 150ms ease, color 150ms ease;

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.primary.plainColor : theme.background.level2};
    color: ${({ $active, theme }) =>
      $active ? theme.text.buttonHighlight : theme.text.primary};
  }

  & > svg {
    font-size: 0.95rem;
  }
`;

const Appearance = () => {
  const { mode, setMode } = useColorScheme();
  const setTheme = useSetRecoilState(fos.theme);

  const switchTo = (next: "light" | "dark") => {
    setMode(next);
    setTheme(next);
  };

  return (
    <ShortcutGroup>
      <GroupLabel>Theme</GroupLabel>
      <Row>
        <RowLabel>Color scheme</RowLabel>
        <ToggleGroup>
          <ToggleButton
            $active={mode === "light"}
            onClick={() => switchTo("light")}
          >
            <LightMode />
            Light
          </ToggleButton>
          <ToggleButton
            $active={mode === "dark"}
            onClick={() => switchTo("dark")}
          >
            <DarkMode />
            Dark
          </ToggleButton>
        </ToggleGroup>
      </Row>
    </ShortcutGroup>
  );
};

export default Appearance;
