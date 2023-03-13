import React, { useCallback, useLayoutEffect, useState } from "react";
import { atom, useRecoilCallback, useRecoilValue } from "recoil";

import { SORT_BY_SIMILARITY } from "../../../utils/links";
import { useExternalLink } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Button } from "../../utils";
import Input from "../../Common/Input";
import RadioGroup from "../../Common/RadioGroup";
import Popout from "../Popout";
import Warning from "./Warning";
import GroupButton, { ButtonDetail } from "./GroupButton";
import {
  availableSimilarityKeys,
  currentBrainConfig,
  currentSimilarityKeys,
  sortType,
  useSortBySimilarity,
} from "./utils";
import MaxKWarning from "./MaxKWarning";

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
}

export const searchBrainKeyValue = atom<string>({
  key: "searchBrainKeyValue",
  default: "",
});

const SortBySimilarity = ({
  modal,
  bounds,
  close,
  isImageSearch,
}: SortBySimilarityProps) => {
  const current = useRecoilValue(fos.similarityParameters);
  const [open, setOpen] = useState(false);
  const [showMaxKWarning, setShowMaxKWarning] = useState(false);

  const [state, setState] = useState<fos.State.SortBySimilarityParameters>(
    () =>
      current || {
        brainKey: null,
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

  useLayoutEffect(() => {
    choices.choices.length === 1 &&
      updateState({ brainKey: choices.choices[0] });
  }, [choices]);

  useLayoutEffect(() => {
    current && setState(current);
  }, [current]);

  const validateK = (value: string) => {
    if (/^[0-9\b]+$/.test(value)) {
      if (!brainConfig?.maxK) {
        setShowMaxKWarning(false);
        return true;
      } else {
        if (Number(value) > brainConfig.maxK) {
          setShowMaxKWarning(true);
        } else {
          setShowMaxKWarning(false);
        }
        return Number(value) <= brainConfig.maxK;
      }
    }
    setShowMaxKWarning(false);
    return false;
  };

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
        onClick: () => sortBySimilarity(state),
      },
      ...loadingButton,
      ...groupButtons,
    ];
  }

  return (
    <Popout modal={modal} bounds={bounds} style={{ minWidth: 280 }}>
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
              onEnter={() => sortBySimilarity(state)}
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
              validator={(value) => value === "" || validateK(value)}
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
                onClose={() => setShowMaxKWarning(false)}
              />
            )}
            using this brain key
            <RadioGroup
              choices={choices.choices}
              value={state?.brainKey}
              setValue={(brainKey) => updateState({ brainKey })}
            />
          </div>
          Optional: store the distance between each sample and the query in this
          field
          <Input
            placeholder={"dist_field (default = None)"}
            validator={(value) => !value.startsWith("_")}
            value={state.distField ?? ""}
            setter={(value) =>
              updateState({ distField: !value.length ? undefined : value })
            }
          />
        </div>
      )}
    </Popout>
  );
};

export default SortBySimilarity;
