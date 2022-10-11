import React, {
  MutableRefObject,
  Suspense,
  useLayoutEffect,
  useState,
} from "react";
import numeral from "numeral";
import { CircularProgress } from "@mui/material";
import {
  RecoilState,
  RecoilValue,
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { useSpring } from "@react-spring/web";

import Checker, { CheckState } from "./Checker";
import Popout from "./Popout";
import {
  tagStats,
  SwitchDiv,
  SwitcherDiv,
  tagStatistics,
  numItemsInSelection,
  selectedSamplesCount,
  tagParameters,
} from "./utils";
import { Button } from "../utils";
import { PopoutSectionTitle } from "@fiftyone/components";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { getFetchFunction } from "@fiftyone/utilities";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  currentSlice,
  groupId,
  groupStatistics,
  Lookers,
} from "@fiftyone/state";

const IconDiv = styled.div`
  position: absolute;
  top: 0.25rem;
  right: -0.75rem;
  height: 2rem;
  width: 2rem;

  & > svg {
    margin-top: 0.5rem;
    margin-right: 0.25rem;
    color: ${({ theme }) => theme.text.primary};
  }
`;

const Loading = React.memo(({ loading }: { loading: boolean }) => {
  const theme = useTheme();
  return (
    <IconDiv>
      {loading && (
        <CircularProgress
          style={{
            color: theme.text.primary,
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
  border-bottom: 1px ${({ theme }) => theme.primary.plainColor} solid;
  position: relative;
  margin: 0.5rem 0;
`;

const TaggingInput = styled.input`
  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.text.primary};
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
    color: ${({ theme }) => theme.text.secondary};
    font-weight: bold;
  }
`;

interface SectionProps {
  countAndPlaceholder: () => [number, string];
  taggingAtom: RecoilState<boolean>;
  itemsAtom: RecoilValue<{ [key: string]: number }>;
  submit: ({ changes }) => Promise<void>;
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
  const elementNames = useRecoilValue(fos.elementNames);
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

  if (!items) {
    return <Loader />;
  }

  const hasChanges = Object.keys(changes).length > 0;

  const hasCreate = value.length > 0 && !(value in changes || value in items);

  return (
    <>
      <TaggingContainerInput>
        <TaggingInput
          placeholder={
            count == 0
              ? `No ${labels ? "labels" : elementNames.plural}`
              : disabled
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
                  labels && count > 1
                    ? "labels"
                    : labels
                    ? "label"
                    : count > 1
                    ? elementNames.plural
                    : elementNames.singular
                }`
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
              }${
                labels && count > 1
                  ? "labels"
                  : labels
                  ? "label"
                  : count > 1
                  ? elementNames.plural
                  : elementNames.singular
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setValue("");
                setChanges({ ...changes, [value]: CheckState.ADD });
              }}
              style={{
                margin: "0.25rem -0.5rem",
                paddingLeft: "0.5rem",
                height: "2rem",
                borderRadius: 0,
              }}
            />
          )}
          {hasChanges && !value.length && (
            <Button
              text={"Apply"}
              onClick={() => submitWrapper(changes)}
              style={{
                margin: "0.25rem -0.5rem",
                height: "2rem",
                borderRadius: 0,
                textAlign: "center",
              }}
            />
          )}
        </>
      ) : null}
    </>
  );
};

const labelsPlaceholder = (selection, numLabels, numSamples, elementNames) => {
  if (numSamples === 0) {
    return `no ${elementNames.plural}`;
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

const samplesPlaceholder = (numSamples, elementNames, selected = false) => {
  if (numSamples === 0) {
    return `no ${elementNames.plural}`;
  }
  if (selected) {
    const formatted = numeral(numSamples).format("0,0");
    return `+ tag ${numSamples > 1 ? `${formatted} ` : ""}selected ${
      numSamples === 1 ? elementNames.singular : elementNames.plural
    }`;
  }

  const formatted = numeral(numSamples).format("0,0");
  return `+ tag ${numSamples > 1 ? `${formatted} ` : ""}${
    numSamples === 1 ? elementNames.singular : elementNames.plural
  }`;
};

const useTagCallback = (
  modal,
  targetLabels,
  lookerRef?: React.MutableRefObject<Lookers | undefined>
) => {
  const setAggs = useSetRecoilState(fos.aggregationsTick);
  const setLabels = fos.useSetSelectedLabels();
  const setSamples = fos.useSetSelected();
  const updateSample = fos.useUpdateSample();

  const finalize = [
    () => setLabels([]),
    () => setSamples([]),
    () => setAggs((cur) => cur + 1),
    ...[
      useRecoilRefresher_UNSTABLE(tagStatistics({ modal, labels: false })),
      useRecoilRefresher_UNSTABLE(tagStatistics({ modal, labels: true })),
    ],
  ];

  return useRecoilCallback(
    ({ snapshot, set, reset }) =>
      async ({ changes }) => {
        const modalData = modal ? await snapshot.getPromise(fos.modal) : null;
        const isGroup = await snapshot.getPromise(fos.isGroup);

        const { samples } = await getFetchFunction()("POST", "/tag", {
          ...tagParameters({
            activeFields: await snapshot.getPromise(
              fos.labelPaths({ expanded: false })
            ),
            dataset: await snapshot.getPromise(fos.datasetName),
            filters: await snapshot.getPromise(
              modal ? fos.modalFilters : fos.filters
            ),
            hiddenLabels: await snapshot.getPromise(fos.hiddenLabelsArray),
            groupData: isGroup
              ? {
                  id: modal ? await snapshot.getPromise(groupId) : null,
                  slice: await snapshot.getPromise(currentSlice(modal)),
                  mode: await snapshot.getPromise(groupStatistics(modal)),
                }
              : null,
            modal,
            sampleId: modal
              ? await snapshot.getPromise(fos.sidebarSampleId)
              : null,
            selectedLabels: await snapshot.getPromise(fos.selectedLabelList),
            selectedSamples: await snapshot.getPromise(fos.selectedSamples),
            targetLabels,
            view: await snapshot.getPromise(fos.view),
          }),
          current_frame: lookerRef?.current?.frameNumber,
          changes,
        });

        if (samples) {
          set(fos.refreshGroupQuery, (cur) => cur + 1);
          samples.forEach((sample) => {
            if (modalData.sample._id === sample._id) {
              set(fos.modal, { ...modalData, sample });
              lookerRef &&
                lookerRef.current &&
                lookerRef.current.updateSample(sample);
            }
            updateSample(sample);
          });
        }

        set(fos.anyTagging, false);
        reset(fos.selectedLabels);
        reset(fos.selectedSamples);

        finalize.forEach((r) => r());
      },
    [modal, targetLabels, lookerRef, updateSample]
  );
};

const Loader = () => {
  const theme = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <CircularProgress
        style={{ color: theme.text.secondary, margin: "1rem 0" }}
      />
    </div>
  );
};

const usePlaceHolder = (
  modal: boolean,
  labels: boolean,
  elementNames: { plural: string; singular: string }
) => {
  return (): [number, string] => {
    const selectedSamples = useRecoilValue(fos.selectedSamples).size;
    const selectedLabels = useRecoilValue(fos.selectedLabelIds).size;
    const totalSamples = useRecoilValue(
      fos.count({ path: "", extended: false, modal })
    );
    const filteredSamples = useRecoilValue(
      fos.count({ path: "", extended: true, modal })
    );

    const count = filteredSamples ?? totalSamples;
    const itemCount = useRecoilValue(selectedSamplesCount(modal));
    const selectedLabelCount = useRecoilValue(numItemsInSelection(true));
    const totalLabelCount = useRecoilValue(
      fos.labelCount({ modal, extended: true })
    );
    if (modal && labels && (!selectedSamples || selectedLabels)) {
      const labelCount = selectedLabels > 0 ? selectedLabels : totalLabelCount;
      return [labelCount, labelsModalPlaceholder(selectedLabels, labelCount)];
    } else if (modal && !selectedSamples) {
      return [itemCount, samplesPlaceholder(count, elementNames)];
    } else {
      const labelCount = selectedSamples ? selectedLabelCount : totalLabelCount;
      if (labels) {
        return [
          labelCount,
          labelsPlaceholder(selectedSamples, labelCount, count, elementNames),
        ];
      } else {
        return [
          itemCount,
          samplesPlaceholder(itemCount, elementNames, Boolean(selectedSamples)),
        ];
      }
    }
  };
};

type TaggerProps = {
  modal: boolean;
  bounds: any;
  close: () => void;
  lookerRef?: MutableRefObject<
    VideoLooker | ImageLooker | FrameLooker | undefined
  >;
};

const Tagger = ({ modal, bounds, close, lookerRef }: TaggerProps) => {
  const [labels, setLabels] = useState(modal);
  const elementNames = useRecoilValue(fos.elementNames);
  const theme = useTheme();
  const sampleProps = useSpring({
    borderBottomColor: labels
      ? theme.background.level2
      : theme.primary.plainColor,
    cursor: labels ? "pointer" : "default",
  });

  const labelProps = useSpring({
    borderBottomColor: labels
      ? theme.primary.plainColor
      : theme.background.level2,
    cursor: labels ? "default" : "pointer",
  });

  const submit = useTagCallback(modal, labels, lookerRef);
  const placeholder = usePlaceHolder(modal, labels, elementNames);
  return (
    <Popout style={{ width: "12rem" }} modal={modal} bounds={bounds}>
      <SwitcherDiv>
        <SwitchDiv
          style={sampleProps}
          onClick={() => labels && setLabels(false)}
        >
          {modal ? elementNames.singular : elementNames.plural}
        </SwitchDiv>
        <SwitchDiv
          style={labelProps}
          onClick={() => !labels && setLabels(true)}
        >
          Labels
        </SwitchDiv>
      </SwitcherDiv>
      {labels && (
        <Suspense fallback={null} key={"labels"}>
          <Section
            countAndPlaceholder={placeholder}
            submit={submit}
            taggingAtom={fos.tagging({ modal, labels })}
            itemsAtom={tagStats({ modal, labels })}
            close={close}
            labels={true}
          />
        </Suspense>
      )}
      {!labels && (
        <Suspense fallback={null} key={elementNames.plural}>
          <Section
            countAndPlaceholder={placeholder}
            submit={submit}
            taggingAtom={fos.tagging({ modal, labels })}
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
