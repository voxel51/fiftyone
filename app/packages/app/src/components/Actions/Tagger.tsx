import React, {
  MutableRefObject,
  Suspense,
  useLayoutEffect,
  useState,
} from "react";
import numeral from "numeral";
import { CircularProgress } from "@material-ui/core";
import {
  RecoilState,
  RecoilValue,
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";
import { useSpring } from "@react-spring/web";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import * as schemaAtoms from "../../recoil/schema";
import * as viewAtoms from "../../recoil/view";

import Checker, { CheckState } from "./Checker";
import Popout from "./Popout";
import {
  tagStats,
  numLabelsInSelectedSamples,
  SwitchDiv,
  SwitcherDiv,
  tagStatistics,
} from "./utils";
import { Button } from "../utils";
import { PopoutSectionTitle } from "../utils";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { filters, modalFilters } from "../../recoil/filters";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { store } from "../Flashlight.store";
import { useTheme } from "@fiftyone/components";

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
  const elementNames = useRecoilValue(viewAtoms.elementNames);
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

const samplesPlaceholder = (selection, _, numSamples, elementNames) => {
  if (numSamples === 0) {
    return `no ${elementNames.plural}`;
  }
  if (selection) {
    numSamples = selection;
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

const samplePlaceholder = (elementNames) => {
  return `+ tag ${elementNames.singular}`;
};

const useTagCallback = (modal, targetLabels, lookerRef = null) => {
  const refreshers = [true, false]
    .map((modal) =>
      [true, false].map((extended) =>
        useRecoilRefresher_UNSTABLE(
          aggregationAtoms.aggregations({ modal, extended })
        )
      )
    )
    .flat();
  refreshers.push(
    useRecoilRefresher_UNSTABLE(tagStatistics({ modal, labels: false }))
  );
  refreshers.push(
    useRecoilRefresher_UNSTABLE(tagStatistics({ modal, labels: targetLabels }))
  );

  return useRecoilCallback(
    ({ snapshot, set }) => async ({ changes }) => {
      const activeLabels = await snapshot.getPromise(
        schemaAtoms.labelPaths({ expanded: false })
      );
      const f = await snapshot.getPromise(modal ? modalFilters : filters);
      const view = await snapshot.getPromise(viewAtoms.view);
      const dataset = await snapshot.getPromise(selectors.datasetName);
      const selectedLabels =
        modal && targetLabels
          ? (await snapshot.getPromise(atoms.stateDescription)).selectedLabels
          : null;
      const selectedSamples = await snapshot.getPromise(atoms.selectedSamples);
      const hiddenLabels =
        modal && targetLabels
          ? await snapshot.getPromise(selectors.hiddenLabelsArray)
          : null;

      const modalData = modal ? await snapshot.getPromise(atoms.modal) : null;

      const { samples } = await getFetchFunction()("POST", "/tag", {
        filters: f,
        view,
        dataset,
        active_label_fields: activeLabels,
        target_labels: targetLabels,
        changes,
        modal: modal ? modalData.sample._id : null,
        sample_ids: modal
          ? null
          : selectedSamples.size
          ? [...selectedSamples]
          : null,
        labels:
          selectedLabels && selectedLabels.length
            ? toSnakeCase(selectedLabels)
            : null,
        hidden_labels: hiddenLabels ? toSnakeCase(hiddenLabels) : null,
      });

      samples &&
        samples.forEach((sample) => {
          if (modalData.sample._id === sample._id) {
            set(atoms.modal, { ...modalData, sample });
            lookerRef.current.updateSample(sample);
          }

          store.samples.set(sample._id, {
            ...store.samples.get(sample._id),
            sample,
          });
          store.lookers.has(sample._id) &&
            store.lookers.get(sample._id).updateSample(sample);
        });

      set(selectors.anyTagging, false);

      refreshers.forEach((r) => r());
      set(atoms.tagging({ modal, labels: targetLabels }), false);
    },
    [modal, targetLabels, lookerRef]
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
  labels: boolean,
  elementNames: { plural: string; singular: string }
) => {
  return (): [number, string] => {
    const selectedSamples = useRecoilValue(atoms.selectedSamples).size;

    const selectedLabels = useRecoilValue(selectors.selectedLabelIds).size;
    if (modal && labels && (!selectedSamples || selectedLabels)) {
      const labelCount =
        selectedLabels > 0
          ? selectedLabels
          : useRecoilValue(
              aggregationAtoms.labelCount({ modal: true, extended: true })
            );
      return [labelCount, labelsModalPlaceholder(selectedLabels, labelCount)];
    } else if (modal && !selectedSamples) {
      return [1, samplePlaceholder(elementNames)];
    } else {
      const totalSamples = useRecoilValue(
        aggregationAtoms.count({ path: "", extended: false, modal: false })
      );
      const filteredSamples = useRecoilValue(
        aggregationAtoms.count({ path: "", extended: true, modal: false })
      );
      const count = filteredSamples ?? totalSamples;
      const selectedLabelCount = useRecoilValue(numLabelsInSelectedSamples);
      const labelCount = selectedSamples
        ? selectedLabelCount
        : useRecoilValue(
            aggregationAtoms.labelCount({ modal, extended: true })
          );
      if (labels) {
        return [
          labelCount,
          labelsPlaceholder(selectedSamples, labelCount, count, elementNames),
        ];
      } else {
        return [
          selectedSamples > 0 ? selectedSamples : count,
          samplesPlaceholder(selectedSamples, labelCount, count, elementNames),
        ];
      }
    }
  };
};

type TaggerProps = {
  modal: boolean;
  bounds: any;
  close: () => void;
  lookerRef?: MutableRefObject<VideoLooker | ImageLooker | FrameLooker>;
};

const Tagger = ({ modal, bounds, close, lookerRef }: TaggerProps) => {
  const [labels, setLabels] = useState(modal);
  const elementNames = useRecoilValue(viewAtoms.elementNames);
  const theme = useTheme();
  const sampleProps = useSpring({
    borderBottomColor: labels ? theme.backgroundDark : theme.brand,
    cursor: labels ? "pointer" : "default",
  });

  const labelProps = useSpring({
    borderBottomColor: labels ? theme.brand : theme.backgroundDark,
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
            taggingAtom={atoms.tagging({ modal, labels })}
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
