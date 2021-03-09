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
import {
  PopoutDiv,
  PopoutSectionTitle,
  TabOptionProps,
  TabOption,
} from "../utils";

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
            marginTop: "0.25rem",
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

const Section = ({ modal, title, placeholder, submit, taggingAtom }) => {
  const count = useRecoilValue(selectors.currentCount);
  const [tagging, setTagging] = useRecoilState(taggingAtom);
  const [untag, setUntag] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const isInSelection = selectedSamples.size > 0;
  const [value, setValue] = useState("");
  const disabled = tagging || typeof count !== "number" || count === 0;

  const numSamples = isInSelection ? selectedSamples.size : count;

  return (
    <>
      <PopoutSectionTitle>{title}</PopoutSectionTitle>
      <TaggingContainerInput>
        <TaggingInput
          placeholder={
            disabled
              ? "loading..."
              : placeholder(isInSelection, numSamples, untag)
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              setTagging(true);
              setValue("");
              submit(value, untag, isInSelection);
            }
          }}
          disabled={disabled}
        />
        <Loading loading={tagging || typeof count !== "number"} />
      </TaggingContainerInput>
      <Options
        options={[
          {
            active: untag ? "- remove" : "+ add",
            options: [
              {
                text: "+ add",
                title: "tag items, if necessary",
                onClick: () => setUntag(false),
              },
              {
                text: "- remove",
                title: "untag items, if necessary",
                onClick: () => setUntag(true),
              },
            ],
          },
        ]}
      />
    </>
  );
};

type TaggerProps = {
  modal: boolean;
};

const Tagger = ({ modal }: TaggerProps) => {
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });
  const socket = useRecoilValue(selectors.socket);
  const activeLabels = useRecoilValue(fieldAtoms.activeFields(false));

  return (
    <PopoutDiv style={{ ...show, width: "18rem" }}>
      <Section
        modal={modal}
        title={"Samples"}
        placeholder={(selection, num, untag) => {
          if (num === 0) {
            return "no samples";
          }
          if (selection) {
            return `${untag ? "- untag" : "+ tag"} ${num} selected sample${
              num === 1 ? "" : "s"
            }`;
          }

          return `${untag ? "- untag" : "+ tag"} ${num} sample${
            num === 1 ? "" : "s"
          }`;
        }}
        submit={(value, untag, selected) =>
          socket.send(
            packageMessage("tag", {
              untag,
              target_labels: false,
              selected: selected,
              active_labels: activeLabels,
              tag: value,
            })
          )
        }
        taggingAtom={atoms.tagging({ modal, labels: false })}
      />
      <Section
        modal={modal}
        title={"Labels"}
        placeholder={(selection, num, untag) => {
          if (num === 0) {
            return "no samples";
          }
          if (selection) {
            return `${
              untag ? "- untag" : "+ tag"
            } shown labels in ${num} selected sample${num === 1 ? "" : "s"}`;
          }

          return `${
            untag ? "- untag" : "+ tag"
          } shown labels in  ${num} sample${num === 1 ? "" : "s"}`;
        }}
        submit={(value, untag, selected) =>
          socket.send(
            packageMessage("tag", {
              untag,
              target_labels: true,
              selected: selected,
              active_labels: activeLabels,
              tag: value,
            })
          )
        }
        taggingAtom={atoms.tagging({ modal, labels: true })}
      />
    </PopoutDiv>
  );
};

export default React.memo(Tagger);
