import React, { Suspense, useLayoutEffect, useState } from "react";
import numeral from "numeral";
import { CircularProgress } from "@material-ui/core";
import {
  RecoilState,
  RecoilValue,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";

import Checker, { CheckState } from "./Checker";
import Popout from "./Popout";
import { tagStats, numLabelsInSelectedSamples } from "./utils";
import { Button } from "../FieldsSidebar";
import * as labelAtoms from "../Filters/LabelFieldFilters.state";
import * as fieldAtoms from "../Filters/utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import socket from "../../shared/connection";
import { useTheme } from "../../utils/hooks";
import { packageMessage } from "../../utils/socket";
import { PopoutSectionTitle } from "../utils";

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

interface SectionProps {
  countAndPlaceholder: () => [number, string];
  taggingAtom: RecoilState<boolean>;
  itemsAtom: RecoilValue<{ [key: string]: number }>;
  submit: ({ changes: Changes }) => Promise<void>;
  close: () => void;
  labels: boolean;
}

const Section = ({
  countAndPlaceholder,
  submit,
  taggingAtom,
  itemsAtom,
  close,
  labels,
}: SectionProps) => {
  const items = useRecoilValue(itemsAtom);
  const [tagging, setTagging] = useRecoilState(taggingAtom);
  const [value, setValue] = useState("");
  const [count, placeholder] = countAndPlaceholder();
  const disabled = tagging || typeof count !== "number";
  const [changes, setChanges] = useState<{ [key: string]: CheckState }>({});
  const [active, setActive] = useState(null);
  const [localTagging, setLocalTagging] = useState(false);

  useLayoutEffect(() => {
    setChanges({});
  }, [taggingAtom]);

  useLayoutEffect(() => {
    tagging && setLocalTagging(true);
    !tagging && localTagging && close();
  }, [tagging, localTagging]);

  const filter = (obj: object) =>
    Object.fromEntries(
      Object.entries(obj).filter(([k]) =>
        k.toLowerCase().includes(value.toLowerCase())
      )
    );

  const submitWrapper = (changes) => {
    submit({
      changes: Object.fromEntries(
        Object.entries(changes).map(([k, v]) => [k, v === CheckState.ADD])
      ),
    });
    setTagging(true);
  };

  const hasChanges = Object.keys(changes).length > 0;

  const hasCreate = value.length > 0 && !(value in changes || value in items);

  return (
    <>
      <TaggingContainerInput>
        <TaggingInput
          placeholder={
            disabled
              ? count === null
                ? "loading..."
                : "saving..."
              : placeholder
          }
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (e.target.value.length) {
              const results = Array.from(
                new Set(Object.keys({ ...items, ...changes }))
              )
                .sort()
                .filter((v) =>
                  v.toLocaleLowerCase().includes(e.target.value.toLowerCase())
                );
              results.length && setActive(results[0]);
            }
          }}
          title={
            hasCreate
              ? `Enter to add "${value}" tag to ${count} ${
                  labels ? "label" : "sample"
                }${count > 1 ? "s" : ""}`
              : null
          }
          onKeyPress={(e) => {
            if (e.key === "Enter" && hasCreate) {
              setValue("");
              setChanges({ ...changes, [value]: CheckState.ADD });
            }
          }}
          focused={!disabled}
          disabled={disabled || count === 0}
          autoFocus
          onBlur={({ target }) => target.focus()}
          type={"text"}
        />
        <Loading loading={Boolean(tagging || typeof count !== "number")} />
      </TaggingContainerInput>
      {count > 0 && (
        <Checker
          active={active}
          disabled={disabled}
          items={filter(items)}
          changes={filter(changes)}
          count={count}
          setActive={setActive}
          setChange={(name: string, value: CheckState | null) => {
            const newChanges = { ...changes };
            if (value === null) {
              delete newChanges[name];
            } else {
              newChanges[name] = value;
            }
            setChanges(newChanges);
          }}
        />
      )}
      {!disabled && (hasChanges || hasCreate) ? (
        <>
          <PopoutSectionTitle />
          {hasCreate && (
            <Button
              text={`Add "${value}" tag to ${
                count > 1 ? numeral(count).format("0,0") + " " : ""
              }${labels ? "label" : "sample"}${count > 1 ? "s" : ""}`}
              onClick={() => {
                setValue("");
                setChanges({ ...changes, [value]: CheckState.ADD });
              }}
              style={{
                margin: "0.25rem -0.5rem",
                paddingLeft: "0.5rem",
                height: "2rem",
                borderRadius: 0,
              }}
            ></Button>
          )}
          {hasChanges && !value.length && (
            <Button
              text={"Apply"}
              onClick={() => submitWrapper(changes)}
              style={{
                margin: "0.25rem -0.5rem",
                paddingLeft: "2.5rem",
                height: "2rem",
                borderRadius: 0,
              }}
            ></Button>
          )}
        </>
      ) : null}
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

const labelsPlaceholder = (selection, numLabels, numSamples) => {
  if (numSamples === 0) {
    return "no samples";
  }
  const formatted = numeral(numLabels).format("0,0");
  if (numLabels === 0) {
    return "no labels";
  }
  if (selection) {
    return `+ tag ${numLabels > 1 ? `${formatted} ` : ""}selected label${
      numLabels > 1 ? "s" : ""
    }`;
  }

  return `+ tag ${formatted} label${numLabels > 1 ? "s" : ""}`;
};

const labelsModalPlaceholder = (selection, numLabels) => {
  if (selection) {
    numLabels = selection;
    const formatted = numeral(numLabels).format("0,0");
    return `+ tag ${numLabels > 1 ? `${formatted} ` : ""}selected label${
      numLabels === 1 ? "" : "s"
    }`;
  }

  const formatted = numeral(numLabels).format("0,0");
  return `+ tag ${numLabels > 1 ? `${formatted} ` : ""} label${
    numLabels === 1 ? "" : "s"
  }`;
};

const samplesPlaceholder = (selection, _, numSamples) => {
  if (numSamples === 0) {
    return "no samples";
  }
  if (selection) {
    numSamples = selection;
    const formatted = numeral(numSamples).format("0,0");
    return `+ tag ${numSamples > 1 ? `${formatted} ` : ""}selected sample${
      numSamples === 1 ? "" : "s"
    }`;
  }

  const formatted = numeral(numSamples).format("0,0");
  return `+ tag ${numSamples > 1 ? `${formatted} ` : ""}sample${
    numSamples === 1 ? "" : "s"
  }`;
};

const samplePlaceholder = () => {
  return "+ tag sample";
};

const packageGrid = ({ targetLabels, activeLabels, changes }) =>
  packageMessage("tag", {
    target_labels: targetLabels,
    active_labels: activeLabels.filter(
      (l) => !(l.startsWith("tags.") || l.startsWith("_label_tags."))
    ),
    changes,
  });

const packageModal = ({ labels = null, sample_id = null, changes }) =>
  packageMessage("tag_modal", {
    changes,
    labels,
    sample_id,
  });

const useTagCallback = (modal, targetLabels) => {
  return useRecoilCallback(
    ({ snapshot }) => async ({ changes }) => {
      const activeLabels = await snapshot.getPromise(
        fieldAtoms.activeLabelPaths(modal)
      );
      if (modal) {
        const hasSelectedLabels =
          Object.keys(await snapshot.getPromise(selectors.selectedLabels))
            .length > 0;
        if (!targetLabels) {
          const sample_id = (await snapshot.getPromise(selectors.modalSample))
            ._id;
          socket.send(packageModal({ sample_id, changes }));
        } else if (hasSelectedLabels) {
          socket.send(packageModal({ changes }));
        } else {
          const labels = await snapshot.getPromise(labelAtoms.modalLabels);
          socket.send(packageModal({ changes, labels }));
        }
      } else {
        socket.send(packageGrid({ changes, targetLabels, activeLabels }));
      }
    },
    [modal, targetLabels]
  );
};

const Loader = () => {
  const theme = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <CircularProgress style={{ color: theme.fontDark, margin: "1rem 0" }} />
    </div>
  );
};

const usePlaceHolder = (
  modal: boolean,
  labels: boolean
): (() => [number, string]) => {
  return () => {
    const selection = useRecoilValue(
      modal ? selectors.selectedLabelIds : atoms.selectedSamples
    ).size;
    let labelCount = useRecoilValue(labelAtoms.labelCount(modal));

    if (modal && labels) {
      labelCount = selection > 0 ? selection : labelCount;
      return [labelCount, labelsModalPlaceholder(selection, labelCount)];
    } else if (modal) {
      return [1, samplePlaceholder()];
    } else {
      const totalSamples = useRecoilValue(selectors.totalCount);
      const filteredSamples = useRecoilValue(selectors.filteredCount);
      const count = filteredSamples ?? totalSamples;
      const selectedLabelCount = useRecoilValue(numLabelsInSelectedSamples);
      labelCount = selection ? selectedLabelCount : labelCount;
      if (labels) {
        return [labelCount, labelsPlaceholder(selection, labelCount, count)];
      } else {
        return [
          selection > 0 ? selection : count,
          samplesPlaceholder(selection, labelCount, count),
        ];
      }
    }
  };
};

type TaggerProps = {
  modal: boolean;
  bounds: any;
  close: () => void;
};

const Tagger = ({ modal, bounds, close }: TaggerProps) => {
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
  const placeholder = usePlaceHolder(modal, labels);

  return (
    <Popout style={{ width: "12rem" }} modal={modal} bounds={bounds}>
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
      {labels && (
        <Suspense fallback={<Loader />} key={"labels"}>
          <Section
            countAndPlaceholder={placeholder}
            submit={submit}
            taggingAtom={atoms.tagging({ modal, labels })}
            itemsAtom={tagStats({ modal, labels })}
            close={close}
            labels={true}
          />
        </Suspense>
      )}
      {!labels && (
        <Suspense fallback={<Loader />} key={"samples"}>
          <Section
            countAndPlaceholder={placeholder}
            submit={submit}
            taggingAtom={atoms.tagging({ modal, labels })}
            itemsAtom={tagStats({ modal, labels })}
            close={close}
            labels={false}
          />
        </Suspense>
      )}
    </Popout>
  );
};

export default React.memo(Tagger);
