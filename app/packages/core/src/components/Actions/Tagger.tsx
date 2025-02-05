import { useTrackEvent } from "@fiftyone/analytics";
import {
  LoadingDots,
  PopoutSectionTitle,
  useTheme,
} from "@fiftyone/components";
import {
  FrameLooker,
  ImaVidLooker,
  ImageLooker,
  VideoLooker,
} from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { Lookers, groupId, groupStatistics, refresher } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useSpring } from "@react-spring/web";
import numeral from "numeral";
import React, {
  MutableRefObject,
  Suspense,
  useLayoutEffect,
  useState,
} from "react";
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
import { Button } from "../utils";
import Checker, { CheckState } from "./Checker";
import Popout from "./Popout";
import {
  SwitchDiv,
  SwitcherDiv,
  numItemsInSelection,
  selectedSamplesCount,
  tagParameters,
  tagStatistics,
  tagStats,
} from "./utils";

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
  const theme = useTheme();
  const [tagging, setTagging] = useRecoilState(taggingAtom);
  const [value, setValue] = useState("");
  const [count, placeholder] = countAndPlaceholder();
  const disabled = tagging || typeof count !== "number";
  const [changes, setChanges] = useState<{ [key: string]: CheckState }>({});
  const [active, setActive] = useState<null | string>(null);
  const [localTagging, setLocalTagging] = useState(false);

  useLayoutEffect(() => {
    setChanges({});
  }, [taggingAtom]);

  useLayoutEffect(() => {
    tagging && setLocalTagging(true);
    !tagging && localTagging && close();
  }, [close, tagging, localTagging]);

  const filter = (obj: object) =>
    Object.fromEntries(
      Object.entries(obj).filter(([k]) =>
        k.toLowerCase().includes(value.toLowerCase())
      )
    );

  const trackEvent = useTrackEvent();
  const submitWrapper = (changes) => {
    trackEvent(`tag_${labels ? "label" : "sample"}`, {
      count,
    });
    submit({
      changes: Object.fromEntries(
        Object.entries(changes).map(([k, v]) => [k, v === CheckState.ADD])
      ),
    });
    setTagging(true);
  };

  if (!items) {
    return <LoadingDots text="" style={{ color: theme.text.secondary }} />;
  }

  const hasChanges = Object.keys(changes).length > 0;

  const hasCreate = value.length > 0 && !(value in changes || value in items);
  const isLoading = Boolean(tagging || typeof count !== "number");

  return (
    <>
      <TaggingContainerInput data-cy="tagger-container">
        {isLoading ? (
          <LoadingDots text="" style={{ color: theme.text.secondary }} />
        ) : (
          <TaggingInput
            data-cy={`${labels ? "label" : "sample"}-tag-input`}
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
                : undefined
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasCreate) {
                e.stopPropagation();
                setValue("");
                setActive(null);
                setChanges({ ...changes, [value]: CheckState.ADD });
              }
            }}
            focused={!disabled}
            disabled={disabled || count === 0}
            autoFocus
            onBlur={({ target }) => target.focus()}
            type={"text"}
          />
        )}
      </TaggingContainerInput>
      {count > 0 && (
        <Checker
          clear={() => setValue("")}
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
              text="Apply"
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
  const setAggs = useSetRecoilState(fos.refresher);
  const setLabels = fos.useSetSelectedLabels();
  const setSamples = fos.useSetSelected();
  const updateSamples = fos.useUpdateSamples();

  const finalize = [
    () => setLabels([]),
    () => setSamples(new Set()),
    () => setAggs((cur) => cur + 1),
    ...[
      useRecoilRefresher_UNSTABLE(fos.activeModalSidebarSample),
      useRecoilRefresher_UNSTABLE(tagStatistics({ modal, labels: false })),
      useRecoilRefresher_UNSTABLE(tagStatistics({ modal, labels: true })),
    ],
  ];

  return useRecoilCallback(
    ({ snapshot, set, reset }) =>
      async ({ changes }) => {
        const isGroup = await snapshot.getPromise(fos.isGroup);
        const isNonNestedDynamicGroup = await snapshot.getPromise(
          fos.isNonNestedDynamicGroup
        );
        const isImaVidLookerActive = await snapshot.getPromise(
          fos.isOrderedDynamicGroup
        );

        const mode = await snapshot.getPromise(groupStatistics(modal));
        const currentSlices = await snapshot.getPromise(
          fos.currentSlices(modal)
        );
        const slices = await snapshot.getPromise(fos.groupSlices);
        const { samples } = await getFetchFunction()("POST", "/tag", {
          ...tagParameters({
            activeFields: await snapshot.getPromise(
              fos.activeLabelFields({ modal })
            ),
            dataset: await snapshot.getPromise(fos.datasetName),
            filters: await snapshot.getPromise(
              modal ? fos.modalFilters : fos.filters
            ),
            hiddenLabels: await snapshot.getPromise(fos.hiddenLabelsArray),
            groupData:
              isGroup && !isNonNestedDynamicGroup
                ? {
                    id: modal ? await snapshot.getPromise(groupId) : null,
                    mode,
                    currentSlices,
                    slice: await snapshot.getPromise(fos.groupSlice),
                    slices,
                  }
                : null,
            modal,
            sampleId: modal
              ? await snapshot.getPromise(fos.sidebarSampleId)
              : null,
            selectedLabels: await snapshot.getPromise(fos.selectedLabels),
            selectedSamples: await snapshot.getPromise(fos.selectedSamples),
            targetLabels,
            view: await snapshot.getPromise(fos.view),
            extended: !modal
              ? await snapshot.getPromise(fos.extendedStages)
              : null,
          }),
          current_frame: lookerRef?.current?.frameNumber,
          changes,
        });
        set(refresher, (i) => i + 1);

        if (!modal) {
          const ids = new Set<string>();
          fos.stores.forEach((store) => {
            store.samples.forEach((sample) => {
              ids.add(sample.sample._id);
            });
          });
          updateSamples(
            Array.from(ids).map((id) => [id.split("-")[0], undefined])
          );
        } else if (samples) {
          set(fos.refreshGroupQuery, (cur) => cur + 1);
          updateSamples(samples.map((sample) => [sample._id, sample]));

          if (isImaVidLookerActive) {
            // assuming we're working with only one sample
            (
              lookerRef?.current as unknown as ImaVidLooker
            )?.frameStoreController.store?.updateSample(
              samples[0]._id,
              samples[0]
            );

            lookerRef?.current?.updateSample(samples[0]);
          }
        }

        set(fos.anyTagging, false);
        reset(fos.selectedLabels);
        reset(fos.selectedSamples);

        finalize.forEach((r) => r());
      },
    [modal, targetLabels, lookerRef, updateSamples]
  );
};

const useLabelPlaceHolder = (
  modal: boolean,
  elementNames: { plural: string; singular: string }
) => {
  return (): [number, string] => {
    const selectedSamples = useRecoilValue(fos.selectedSamples).size;
    const selectedLabels = useRecoilValue(fos.selectedLabelIds).size;
    const selectedLabelCount = useRecoilValue(
      numItemsInSelection({ labels: true, modal })
    );
    const totalLabelCount = useRecoilValue(
      fos.labelCount({ modal, extended: true })
    );
    if (modal && selectedLabels) {
      const labelCount = selectedLabels > 0 ? selectedLabels : totalLabelCount;
      return [labelCount, labelsModalPlaceholder(selectedLabels, labelCount)];
    } else {
      const labelCount = selectedSamples ? selectedLabelCount : totalLabelCount;
      return [
        labelCount,
        labelsPlaceholder(selectedSamples, labelCount, null, elementNames),
      ];
    }
  };
};

const useSamplePlaceHolder = (
  modal: boolean,
  elementNames: { plural: string; singular: string }
) => {
  return (): [number, string] => {
    const selectedSamples = useRecoilValue(fos.selectedSamples).size;
    const totalSamples = useRecoilValue(
      fos.count({ path: "", extended: false, modal })
    );
    const filteredSamples = useRecoilValue(
      fos.count({ path: "", extended: true, modal })
    );
    const count = filteredSamples ?? totalSamples;
    const itemCount = useRecoilValue(selectedSamplesCount(modal));
    if (modal && !selectedSamples) {
      return [itemCount, samplesPlaceholder(count, elementNames)];
    } else {
      return [
        itemCount,
        samplesPlaceholder(itemCount, elementNames, Boolean(selectedSamples)),
      ];
    }
  };
};

const SuspenseLoading = () => {
  const theme = useTheme();
  return (
    <TaggingContainerInput>
      <LoadingDots text="Loading" style={{ color: theme.text.secondary }} />
    </TaggingContainerInput>
  );
};

type TaggerProps = {
  modal: boolean;
  close: () => void;
  lookerRef?: MutableRefObject<
    VideoLooker | ImageLooker | FrameLooker | undefined
  >;
  anchorRef?: MutableRefObject<HTMLDivElement>;
};

const Tagger = ({ modal, close, lookerRef, anchorRef }: TaggerProps) => {
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
  const labelPlaceholder = useLabelPlaceHolder(modal, elementNames);
  const samplePlaceholder = useSamplePlaceHolder(modal, elementNames);
  return (
    <Popout
      style={{ width: "12rem" }}
      modal={modal}
      fixed
      anchorRef={anchorRef}
    >
      <SwitcherDiv>
        <SwitchDiv
          data-cy="tagger-switch-sample"
          style={sampleProps}
          onClick={() => labels && setLabels(false)}
        >
          {modal ? elementNames.singular : elementNames.plural}
        </SwitchDiv>
        <SwitchDiv
          data-cy="tagger-switch-label"
          style={labelProps}
          onClick={() => !labels && setLabels(true)}
        >
          Labels
        </SwitchDiv>
      </SwitcherDiv>
      {labels && (
        <Suspense fallback={<SuspenseLoading />} key={"labels"}>
          <Section
            countAndPlaceholder={labelPlaceholder}
            submit={submit}
            taggingAtom={fos.tagging({ modal, labels })}
            itemsAtom={tagStats({ modal, labels })}
            close={close}
            labels={true}
          />
        </Suspense>
      )}
      {!labels && (
        <Suspense fallback={<SuspenseLoading />} key={elementNames.plural}>
          <Section
            countAndPlaceholder={samplePlaceholder}
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
