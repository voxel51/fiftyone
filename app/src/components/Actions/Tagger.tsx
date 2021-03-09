import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring, useSprings } from "react-spring";
import { useRecoilState, useRecoilValue } from "recoil";
import { CircularProgress } from "@material-ui/core";

import { useTheme } from "../../utils/hooks";
import * as fieldAtoms from "../Filters/utils";
import { packageMessage } from "../../utils/socket";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PopoutDiv } from "../utils";

const TabOptionDiv = animated(styled.div`
  display: flex;
  font-weight: bold;
  cursor: pointer;
  justify-content: space-between;
  margin: 0.5rem 0;
  border-radius: 4px;
  height: 2rem;

  & > div {
    display: flex;
    justify-content: center;
    align-content: center;
    flex-direction: column;
    cursor: inherit;
    flex-grow: 1;
    flex-basis: 0;
    text-align: center;
    overflow: hidden;
    border-radius: 4px;
  }
`);

const Tab = animated(styled.div``);

type TabOptionProps = {
  active: string;
  options: TabOption[];
};

type TabOption = {
  text: string;
  onClick: () => void;
  title: string;
};

const TabOption = ({ active, options }: TabOptionProps) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(options.map((o) => false));
  const styles = useSprings(
    options.length,
    options.map((o, i) => ({
      backgroundColor:
        o.text === active
          ? theme.brand
          : hovering[i]
          ? theme.background
          : theme.backgroundLight,
      color: hovering ? theme.font : theme.fontDark,
    }))
  );

  const [style, set] = useSpring(() => ({
    background: theme.backgroundLight,
  }));

  return (
    <TabOptionDiv
      style={style}
      onMouseEnter={() => set({ background: theme.background })}
      onMouseLeave={() => set({ background: theme.backgroundLight })}
    >
      {options.map(({ text, title, onClick }, i) => (
        <Tab
          onClick={onClick}
          title={title}
          style={styles[i]}
          onMouseEnter={() =>
            setHovering(hovering.map((_, j) => (j === i ? true : _)))
          }
          onMouseLeave={() =>
            setHovering(hovering.map((_, j) => (j === i ? false : _)))
          }
          key={i}
        >
          {text}
        </Tab>
      ))}
    </TabOptionDiv>
  );
};

type OptionsProps = {
  options: Array<TabOptionProps>;
};

const Options = React.memo(({ options }: OptionsProps) => {
  return (
    <>
      {options.map((props, key) => (
        <TabOption {...props} key={key} />
      ))}
    </>
  );
});

const IconDiv = styled.div`
  position: absolute;
  top: 0.25rem;
  right: -0.75rem;
  height: 2rem;
  width: 2rem;

  & > svg {
    margin-top: 0.5rem;
    margin-right: 0.25rem;
    color: ${({ theme }) => theme.font};
  }
`;

const Loading = React.memo(({ loading }: { loading: boolean }) => {
  const theme = useTheme();
  return (
    <IconDiv>
      {loading && (
        <CircularProgress
          style={{
            color: theme.font,
            height: 16,
            width: 16,
            marginTop: "0.75rem",
          }}
        />
      )}
    </IconDiv>
  );
});

const TaggingContainerInput = styled.div`
  font-size: 14px;
  border-bottom: 1px ${({ theme }) => theme.brand} solid;
  position: relative;
  margin: 0.5rem 0;
`;

const TaggingInput = styled.input`
  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.font};
  height: 2rem;
  font-size: 14px;
  border: none;
  align-items: center;
  font-weight: bold;
  width: 100%;

  &:focus {
    border: none;
    outline: none;
    font-weight: bold;
  }

  &::placeholder {
    color: ${({ theme }) => theme.fontDark};
    font-weight: bold;
  }
`;

type TaggerProps = {
  modal: boolean;
};

const placeholderDirections = (
  isInSelection,
  numSamples,
  untag,
  targetLabels
) => {
  if (typeof numSamples !== "number") {
    return "loading...";
  }

  if (numSamples === 0) {
    return "no samples";
  }

  return `${untag ? "- untag" : "+ tag"}${
    targetLabels ? " shown labels in" : ""
  } ${numSamples}${isInSelection ? " selected" : ""}${` sample${
    numSamples > 1 ? "s" : ""
  }`}`;
};

const Tagger = ({ modal }: TaggerProps) => {
  const [untag, setUntag] = useState(false);
  const [targetLabels, setTargetLabels] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const isInSelection = selectedSamples.size > 0;
  const [value, setValue] = useState("");
  const socket = useRecoilValue(selectors.socket);
  const activeLabels = useRecoilValue(fieldAtoms.activeFields(false));
  const [tagging, setTagging] = useRecoilState(atoms.tagging("grid"));

  const count = useRecoilValue(selectors.currentCount);

  const disabled = tagging || typeof count !== "number" || count === 0;

  return (
    <PopoutDiv>
      <TaggingContainerInput>
        <TaggingInput
          placeholder={placeholderDirections(
            isInSelection,
            isInSelection ? selectedSamples.size : count,
            untag,
            targetLabels
          )}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              setTagging(true);
              setValue("");
              socket.send(
                packageMessage("tag", {
                  untag,
                  target_labels: targetLabels,
                  selected: isInSelection,
                  active_labels: activeLabels,
                  tag: value,
                })
              );
            }
          }}
          disabled={disabled}
        />
        <Loading loading={tagging || typeof count !== "number"} />
      </TaggingContainerInput>
      <Options
        options={[
          {
            active: untag ? "- untag" : "+ tag",
            options: [
              {
                text: "+ tag",
                title: "tag items, if necessary",
                onClick: () => setUntag(false),
              },
              {
                text: "- untag",
                title: "untag items, if necessary",
                onClick: () => setUntag(true),
              },
            ],
          },
          {
            active: targetLabels ? "labels" : "samples",
            options: [
              {
                text: "samples",
                title: "tag samples",
                onClick: () => setTargetLabels(false),
              },
              {
                text: "labels",
                title: "tag visible labels",
                onClick: () => setTargetLabels(true),
              },
            ],
          },
        ]}
      />
    </PopoutDiv>
  );
};

export default React.memo(Tagger);
