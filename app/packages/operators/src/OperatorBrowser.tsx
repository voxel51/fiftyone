import { useTheme } from "@fiftyone/components";
import { Close, Extension, Help, Lock } from "@mui/icons-material";
import { Link } from "@mui/material";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { initializationErrors } from "./operators";
import { useOperatorBrowser } from "./state";

// todo: use plugin component
import { useEffect, useRef } from "react";
import ErrorView from "../../core/src/plugins/SchemaIO/components/ErrorView";
import OperatorIcon, { CustomIconPropsType } from "./OperatorIcon";
import OperatorPalette from "./OperatorPalette";
import { PaletteContentContainer } from "./styled-components";

const QueryInput = styled.input`
  width: 100%;
  background: none;
  outline: none;
  border: none;
  padding: 0.5rem 1rem;
`;
const ChoiceContainer = styled.div<{ disabled: boolean; selected?: boolean }>`
  display: flex;
  height: 2.5rem;
  line-height: 2.5rem;
  padding: 0 1rem;
  :hover {
    background: ${({ theme }) => theme.background.level1};
    cursor: pointer;
  }
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  background: ${({ selected, theme }) => selected && theme.primary.plainColor};
`;

const ChoiceDescription = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
`;

const ChoiceLabel = styled.div`
  margin-left: auto;
  max-width: 38%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const ChoiceIcon = styled.div`
  margin-right: 0.5rem;
  line-height: 45px;
`;

const Choice = (props: ChoicePropsType) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { onClick, choice, selected } = props;
  const { label, name, canExecute } = choice;
  const disabled = canExecute === false;

  useEffect(() => {
    const containerElem = containerRef.current;
    if (selected && containerElem) {
      containerElem.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <ChoiceContainer
      disabled={disabled}
      onClick={onClick}
      selected={selected}
      ref={containerRef}
    >
      <ChoiceIcon>
        <OperatorIcon {...choice} Fallback={disabled ? Lock : Extension} />
      </ChoiceIcon>
      <ChoiceDescription>{label}</ChoiceDescription>
      {label && <ChoiceLabel>{name}</ChoiceLabel>}
    </ChoiceContainer>
  );
};

const QueryDiv = styled.div`
  position: relative;
  display: flex;
  overflow-x: scroll;
  scrollbar-width: none;
  min-width: 200px;
  flex: 1;

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

const IconsContainer = styled.div`
  display: flex;
  margin-left: auto;
  align-items: center;
  z-index: 1;
  column-gap: 0.5rem;
  padding: 0 0.5rem;
  z-index: 801;
`;
const TopBarDiv = styled.div`
  display: flex;
  background-color: ${({ theme }) => theme.background.level1};
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  box-sizing: border-box;
  height: 52px;
  width: 100%;
`;

export default function OperatorBrowser() {
  const theme = useTheme();
  const browser = useOperatorBrowser();
  const queryInputRef = useRef();

  useEffect(() => {
    const { current } = queryInputRef;
    if (current) current.value = browser.query;
  }, [queryInputRef, browser.query]);

  if (!browser.isVisible) {
    return null;
  }
  return createPortal(
    <OperatorPalette
      onOutsideClick={browser.close}
      title={
        <TopBarDiv>
          <QueryDiv>
            <QueryInput
              ref={queryInputRef}
              autoFocus
              placeholder="Search operations by name..."
              onChange={(e) => browser.onChangeQuery(e.target.value)}
            />
          </QueryDiv>
          <IconsContainer>
            {browser.hasQuery && (
              <Close
                onClick={() => browser.clear()}
                style={{
                  cursor: "pointer",
                  color: theme.text.secondary,
                }}
              />
            )}
            <ErrorView
              schema={{
                view: { detailed: true, popout: true, left: true },
              }}
              data={initializationErrors}
            />
            <Link
              href="https://docs.voxel51.com/user_guide/app.html#operations"
              style={{ display: "flex" }}
              target="_blank"
            >
              <Help style={{ color: theme.text.secondary }} />
            </Link>
          </IconsContainer>
        </TopBarDiv>
      }
    >
      <PaletteContentContainer>
        {browser.choices.map((choice) => (
          <Choice
            onClick={() => browser.setSelectedAndSubmit(choice)}
            key={choice.value}
            choice={choice}
            selected={choice.value === browser.selectedValue}
          />
        ))}
        {browser.choices.length === 0 && (
          <Choice
            onClick={() => {
              // noop
            }}
            key={"no-operator"}
            choice={{ label: "No matching operators" }}
            selected={false}
          />
        )}
      </PaletteContentContainer>
    </OperatorPalette>,
    document.body
  );
}

type ChoiceType = CustomIconPropsType & {
  label: string;
  name?: string;
  canExecute?: boolean;
};

type ChoicePropsType = {
  onClick: () => void;
  choice: ChoiceType;
  selected?: boolean;
};
