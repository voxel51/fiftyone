import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilState, useRecoilValue } from "recoil";
import { CircularProgress } from "@material-ui/core";

import { useTheme } from "../../utils/hooks";
import * as fieldAtoms from "../Filters/utils";
import { packageMessage } from "../../utils/socket";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import Popout from "./Popout";
import { TabOptionProps, TabOption } from "../utils";

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

const Section = ({ modal, placeholder, submit, taggingAtom }) => {
  const count = useRecoilValue(selectors.currentCount);
  const [tagging, setTagging] = useRecoilState(taggingAtom);
  const [untag, setUntag] = useState(false);
  const numSelected = modal
    ? Object.keys(useRecoilValue(atoms.selectedObjects)).length
    : useRecoilValue(atoms.selectedSamples).size;
  const isInSelection = numSelected > 0;
  console.log(isInSelection);
  const [value, setValue] = useState("");
  const disabled = tagging || typeof count !== "number" || count === 0;

  const numSamples = isInSelection ? numSelected : count;

  return (
    <>
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
        <Loading loading={Boolean(tagging || typeof count !== "number")} />
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

const SwitcherDiv = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.background};
  display: flex;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
`;

const SwitchDiv = animated(styled.div`
  flex-basis: 0;
  flex-grow: 1;
  font-size: 1rem;
  padding-left: 0.4rem;
  line-height: 2;
  font-weight: bold;
  border-bottom-color: ${({ theme }) => theme.brand};
  border-bottom-style: solid;
  border-bottom-width: 2px;
`);

type TaggerProps = {
  modal: boolean;
};

const labelsPlaceholder = (selection, num, untag) => {
  if (num === 0) {
    return "no samples";
  }
  if (selection) {
    return `${
      untag ? "- untag" : "+ tag"
    } selected labels in ${num} selected sample${num === 1 ? "" : "s"}`;
  }

  return `${untag ? "- untag" : "+ tag"} shown labels in  ${num} sample${
    num === 1 ? "" : "s"
  }`;
};

const labelsModalPlaceholder = (selection, num, untag) => {
  if (selection) {
    return `${untag ? "- untag" : "+ tag"} ${num} selected labels`;
  }

  return `${untag ? "- untag" : "+ tag"} ${num} visible labels`;
};

const samplesPlaceholder = (selection, num, untag) => {
  if (num === 0) {
    return "no samples";
  }
  if (selection) {
    return `${untag ? "- untag" : "+ tag"} ${num} selected sample${
      num === 1 ? "" : "s"
    }`;
  }

  return `${untag ? "- untag" : "+ tag"} ${num} sample${num === 1 ? "" : "s"}`;
};

const samplePlaceholder = (_, __, untag) => {
  if (untag) {
    return "- untag sample";
  }
  return "+ tag sample";
};

const Tagger = ({ modal }: TaggerProps) => {
  const [labels, setLabels] = useState(modal);
  const theme = useTheme();
  const socket = useRecoilValue(selectors.socket);
  const activeLabels = useRecoilValue(fieldAtoms.activeFields(false));
  const sampleProps = useSpring({
    borderBottomColor: labels ? theme.backgroundDark : theme.brand,
    cursor: labels ? "pointer" : "default",
  });

  const labelProps = useSpring({
    borderBottomColor: labels ? theme.brand : theme.backgroundDark,
    cursor: labels ? "default" : "pointer",
  });

  return (
    <Popout style={{ width: "18rem" }} modal={modal}>
      <SwitcherDiv>
        <SwitchDiv
          style={sampleProps}
          onClick={() => labels && setLabels(false)}
        >
          Sample{modal ? "" : "s"}
        </SwitchDiv>
        <SwitchDiv
          style={labelProps}
          onClick={() => !labels && setLabels(true)}
        >
          Labels
        </SwitchDiv>
      </SwitcherDiv>
      <Section
        modal={modal}
        placeholder={
          labels && !modal
            ? labelsPlaceholder
            : !modal
            ? samplesPlaceholder
            : labels
            ? labelsModalPlaceholder
            : samplePlaceholder
        }
        submit={(value, untag, selected) =>
          socket.send(
            packageMessage("tag", {
              untag,
              target_labels: labels,
              selected: selected,
              active_labels: activeLabels,
              tag: value,
              modal: modal,
            })
          )
        }
        taggingAtom={atoms.tagging({ modal, labels })}
      />
    </Popout>
  );
};

export default React.memo(Tagger);
