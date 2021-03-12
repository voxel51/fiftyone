import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilCallback, useRecoilState, useRecoilValue } from "recoil";
import { CircularProgress } from "@material-ui/core";

import * as labelAtoms from "../Filters/LabelFieldFilters.state";
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
  const labelCount = useRecoilValue(labelAtoms.labelCount(modal));
  const [tagging, setTagging] = useRecoilState(taggingAtom);
  const [untag, setUntag] = useState(false);
  const numSelected = useRecoilValue(
    modal ? selectors.selectedLabelIds : atoms.selectedSamples
  ).size;
  const isInSelection = numSelected > 0;
  const [value, setValue] = useState("");
  const disabled = tagging || typeof count !== "number" || count === 0;

  const numLabels = modal && isInSelection ? numSelected : labelCount;
  const numSamples = isInSelection && !modal ? numSelected : modal ? 1 : count;

  return (
    <>
      <TaggingContainerInput>
        <TaggingInput
          placeholder={
            disabled
              ? "loading..."
              : placeholder(isInSelection, numLabels, numSamples, untag)
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              setTagging(true);
              setValue("");
              submit({ tag: value, untag });
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

const labelsPlaceholder = (selection, numLabels, numSamples, untag) => {
  if (numSamples === 0) {
    return "no samples";
  }
  if (numLabels === 0) {
    return "no labels";
  }
  if (selection) {
    return `${untag ? "- untag" : "+ tag"} ${
      numLabels > 1 ? `${numLabels} ` : ""
    }shown label${numLabels > 1 ? "s" : ""} in ${
      numSamples > 1 ? numSamples : " "
    }selected sample${numSamples === 1 ? "" : "s"}`;
  }

  return `${untag ? "- untag" : "+ tag"} ${numLabels} shown label${
    numLabels > 1 ? "s" : ""
  } in ${numSamples > 1 ? `${numSamples} ` : ""}sample${
    numSamples === 1 ? "" : "s"
  }`;
};

const labelsModalPlaceholder = (selection, numLabels, numSamples, untag) => {
  if (selection) {
    return `${untag ? "- untag" : "+ tag"} ${
      numLabels > 1 ? `${numLabels} ` : ""
    }selected label${numLabels === 1 ? "" : "s"}`;
  }

  return `${untag ? "- untag" : "+ tag"} ${
    numLabels > 1 ? `${numLabels} ` : ""
  }shown label${numLabels === 1 ? "" : "s"}`;
};

const samplesPlaceholder = (selection, numLabels, numSamples, untag) => {
  if (numSamples === 0) {
    return "no samples";
  }
  if (selection) {
    return `${untag ? "- untag" : "+ tag"} ${
      numSamples > 1 ? `${numSamples} ` : ""
    }selected sample${numSamples === 1 ? "" : "s"}`;
  }

  return `${untag ? "- untag" : "+ tag"} ${
    numSamples > 1 ? `${numSamples} ` : ""
  }sample${numSamples === 1 ? "" : "s"}`;
};

const samplePlaceholder = (_, __, ___, untag) => {
  if (untag) {
    return "- untag sample";
  }
  return "+ tag sample";
};

const packageGrid = ({ untag, targetLabels, activeLabels, tag }) =>
  packageMessage("tag", {
    untag,
    target_labels: targetLabels,
    active_labels: activeLabels,
    tag,
  });

const packageModal = ({ untag, labels = null, sample_id = null, tag }) =>
  packageMessage("tag_modal", {
    untag,
    tag,
    labels,
    sample_id,
  });

const useTagCallback = (modal, targetLabels) => {
  return useRecoilCallback(
    ({ snapshot }) => async ({ tag, untag }) => {
      const socket = await snapshot.getPromise(selectors.socket);
      const activeLabels = await snapshot.getPromise(
        fieldAtoms.activeFields(modal)
      );
      if (modal) {
        const hasSelectedLabels =
          Object.keys(await snapshot.getPromise(selectors.selectedLabels))
            .length > 0;
        if (!targetLabels) {
          const sample_id = (await snapshot.getPromise(selectors.modalSample))
            ._id;
          socket.send(packageModal({ sample_id, tag, untag }));
        } else if (hasSelectedLabels) {
          socket.send(packageModal({ tag, untag }));
        } else {
          const labels = await snapshot.getPromise(labelAtoms.modalLabels);
          socket.send(packageModal({ tag, untag, labels }));
        }
      } else {
        socket.send(packageGrid({ untag, targetLabels, activeLabels, tag }));
      }
    },
    [modal, targetLabels]
  );
};

const Tagger = ({ modal, bounds }: TaggerProps) => {
  const [labels, setLabels] = useState(modal);
  const theme = useTheme();
  const sampleProps = useSpring({
    borderBottomColor: labels ? theme.backgroundDark : theme.brand,
    cursor: labels ? "pointer" : "default",
  });

  const labelProps = useSpring({
    borderBottomColor: labels ? theme.brand : theme.backgroundDark,
    cursor: labels ? "default" : "pointer",
  });

  const submit = useTagCallback(modal, labels);

  return (
    <Popout style={{ width: "18rem" }} modal={modal} bounds={bounds}>
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
        submit={submit}
        taggingAtom={atoms.tagging({ modal, labels })}
      />
    </Popout>
  );
};

export default React.memo(Tagger);
