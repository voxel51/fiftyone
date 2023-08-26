import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { atom, useRecoilCallback, useRecoilValue } from "recoil";

import { useExternalLink } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { SORT_BY_SIMILARITY } from "../../../utils/links";
import Input from "../../Common/Input";
import RadioGroup from "../../Common/RadioGroup";
import { Button } from "../../utils";
import Popout from "../Popout";
import GroupButton, { ButtonDetail } from "./GroupButton";
import MaxKWarning from "./MaxKWarning";
import {
  availableSimilarityKeys,
  currentBrainConfig,
  currentSimilarityKeys,
  sortType,
  useSortBySimilarity,
} from "./utils";
import Warning from "./Warning";
import { useBrowserStorage } from "@fiftyone/state";

const DEFAULT_K = 25;

const LONG_BUTTON_STYLE: React.CSSProperties = {
  margin: "0.5rem 0",
  height: "2rem",
  flex: 1,
  textAlign: "center",
};

interface SortBySimilarityProps {
  isImageSearch: boolean;
  modal: boolean;
  close: () => void;
  bounds?: any; // fix me
  anchorRef?: MutableRefObject<unknown>;
}

const SortBySimilarity = ({
  modal,
  bounds,
  close,
  isImageSearch,
  anchorRef,
}: SortBySimilarityProps) => {
  const current = useRecoilValue(fos.similarityParameters);
  const datasetId = useRecoilValue(fos.dataset).id;
  const [lastUsedBrainKeys] = useBrowserStorage("lastUsedBrainKeys");

  const lastUsedBrainkey = useMemo(() => {
    return lastUsedBrainKeys ? JSON.parse(lastUsedBrainKeys)[datasetId] : null;
  }, [lastUsedBrainKeys, datasetId]);

  const [open, setOpen] = useState(false);
  const [showMaxKWarning, setShowMaxKWarning] = useState(false);

  const [state, setState] = useState<fos.State.SortBySimilarityParameters>(
    () =>
      current || {
        brainKey: lastUsedBrainkey,
        distField: null,
        reverse: false,
        k: DEFAULT_K,
      }
  );
  const updateState = useCallback(
    (partial: Partial<fos.State.SortBySimilarityParameters>) =>
      setState((state) => ({ ...state, ...partial })),
    []
  );

  const hasSorting = Boolean(current);
  const hasSimilarityKeys =
    useRecoilValue(availableSimilarityKeys({ modal, isImageSearch })).length >
    0;
  const choices = useRecoilValue(
    currentSimilarityKeys({ modal, isImageSearch })
  );
  const sortBySimilarity = useSortBySimilarity(close);
  const type = useRecoilValue(sortType(modal));
  const brainConfig = useRecoilValue(currentBrainConfig(state.brainKey));

  const reset = useRecoilCallback(
    ({ reset }) =>
      () => {
        reset(fos.similarityParameters);
      },
    []
  );
  const isLoading = useRecoilValue(fos.similaritySorting);
  const isReadOnly = useRecoilValue(fos.readOnly);

  useLayoutEffect(() => {
    if (!choices.choices.includes(state.brainKey)) {
      const newKey =
        choices.choices.length > 0 ? choices.choices[0] : undefined;
      updateState({ brainKey: newKey });
    }
  }, [choices, state.brainKey, updateState]);

  useLayoutEffect(() => {
    current && setState(current);
  }, [current]);

  // show warning if k is undefined or k > maxK
  useEffect(() => {
    if (state.k == undefined) {
      setShowMaxKWarning(true);
    } else if (brainConfig?.maxK && state.k > brainConfig.maxK) {
      setShowMaxKWarning(true);
    } else {
      setShowMaxKWarning(false);
    }
  }, [state.k, state.brainKey]);

  const meetKRequirement = !(
    (brainConfig?.maxK && state.k > brainConfig.maxK) ||
    state.k == undefined
  );

  const loadingButton: ButtonDetail[] = isLoading
    ? [
        {
          icon: "ProgressIcon",
          ariaLabel: "In progress...",
          tooltipText: "",
          onClick: () => {},
        },
      ]
    : [];

  let groupButtons: ButtonDetail[] = [
    ...loadingButton,
    {
      icon: "InfoIcon",
      ariaLabel: "information",
      tooltipText: "Learn more about sorting by similarity",
      onClick: () => {
        useExternalLink(SORT_BY_SIMILARITY);
        window.open(SORT_BY_SIMILARITY, "_blank");
      },
    },
    {
      icon: "SettingsIcon",
      ariaLabel: "Advanced settings",
      tooltipText: "Advanced settings",
      onClick: () => setOpen((o) => !o),
    },
  ];

  if (!isImageSearch && !hasSorting && !isLoading) {
    groupButtons = [
      {
        icon: "SearchIcon",
        ariaLabel: "Submit",
        tooltipText: "Search by similarity to the provided text",
        onClick: () =>
          meetKRequirement &&
          state.query &&
          state.query.length > 0 &&
          sortBySimilarity(state),
      },
      ...loadingButton,
      ...groupButtons,
    ];
  }

  const onChangeBrainKey = useRecoilCallback(
    ({ snapshot }) =>
      async (brainKey: string) => {
        const config = await snapshot.getPromise(currentBrainConfig(brainKey));
        if (config?.maxK && state.k && state.k > config.maxK) {
          setShowMaxKWarning(true);
        } else {
          setShowMaxKWarning(false);
        }
        updateState({ reverse: false, brainKey });
      },
    [updateState, state]
  );

  return (
    <Popout
      modal={modal}
      bounds={bounds}
      style={{ minWidth: 280 }}
      fixed
      anchorRef={anchorRef}
    >
      {hasSimilarityKeys && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexDirection: "row",
          }}
        >
          {!isImageSearch && !hasSorting && (
            <Input
              placeholder={"Type anything!"}
              value={(state.query as string) ?? ""}
              setter={(value) => updateState({ query: value })}
              onEnter={() =>
                meetKRequirement &&
                state.query &&
                state.query.length > 0 &&
                sortBySimilarity(state)
              }
            />
          )}
          {isImageSearch && !hasSorting && (
            <Button
              text={"Show similar samples"}
              title={`Search by similarity to the selected ${type}`}
              onClick={() => sortBySimilarity(state)}
              style={LONG_BUTTON_STYLE}
            />
          )}
          {hasSorting && (
            <Button
              text={"Reset"}
              title={`Clear sorting`}
              onClick={() => {
                close();
                reset();
              }}
              style={LONG_BUTTON_STYLE}
            />
          )}
          <GroupButton buttons={groupButtons} />
        </div>
      )}
      {!hasSimilarityKeys && <Warning hasSimilarityKeys isImageSearch />}
      {open && hasSimilarityKeys && (
        <div>
          <div>
            Find the
            <Input
              placeholder={"k"}
              validator={(value) => /^[0-9\b]+$/.test(value) || value === ""}
              value={state?.k ? String(state.k) : ""}
              setter={(value) => {
                updateState({ k: value == "" ? undefined : Number(value) });
              }}
              style={{
                width: 40,
                display: "inline-block",
                margin: 3,
              }}
            />
            {brainConfig?.supportsLeastSimilarity === false ? (
              "most "
            ) : (
              <Button
                text={state.reverse ? "least" : "most"}
                title={`select most or least`}
                onClick={() => updateState({ reverse: !state.reverse })}
                style={{
                  textAlign: "center",
                  width: 50,
                  display: "inline-block",
                  margin: 3,
                }}
              />
            )}
            {`similar samples `}
            {showMaxKWarning && (
              <MaxKWarning
                maxK={brainConfig?.maxK}
                currentK={state.k}
                onClose={() => setShowMaxKWarning(false)}
              />
            )}
            using this brain key
            <RadioGroup
              choices={choices.choices}
              value={state?.brainKey}
              setValue={(brainKey) => onChangeBrainKey(brainKey)}
            />
          </div>
          {!isReadOnly && (
            <>
              Optional: store the distance between each sample and the query in
              this field
              <Input
                placeholder={"dist_field (default = None)"}
                validator={(value) => !value.startsWith("_")}
                value={state.distField ?? ""}
                setter={(value) =>
                  updateState({ distField: !value.length ? undefined : value })
                }
              />
            </>
          )}
        </div>
      )}
    </Popout>
  );
};

export default SortBySimilarity;
