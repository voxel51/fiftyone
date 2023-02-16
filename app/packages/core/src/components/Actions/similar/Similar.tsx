import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  atom,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";

import * as fos from "@fiftyone/state";

import { useExternalLink } from "@fiftyone/components/src/components/ExternalLink/ExternalLink";
import { SORT_BY_SIMILARITY } from "../../../utils/links";

import { Button } from "../../utils";
import Input from "../../Common/Input";
import RadioGroup from "../../Common/RadioGroup";
import Popout from "../Popout";
import Warning from "./Warning";
import GroupButton, { ButtonDetail } from "./GroupButton";
import {
  availableSimilarityKeys,
  currentSimilarityKeys,
  sortType,
  useSortBySimilarity,
} from "./utils";

const longButtonStyle = {
  margin: "0.25rem",
  height: "2rem",
  borderRadius: 2,
  textAlign: "center",
  width: "185px",
};

const defaultK = 25;

interface SortBySimilarityProps {
  modal: boolean;
  close: () => void;
  bounds?: any;
}

export const searchBrainKeyValue = atom<string>({
  key: "searchBrainKeyValue",
  default: "",
});

export const isImageSimilaritySearch = atom<boolean>({
  key: "isImageSimilaritySearch",
  default: false,
});

const SortBySimilarity = React.memo(
  ({ modal, bounds, close }: SortBySimilarityProps) => {
    const current = useRecoilValue(fos.similarityParameters);
    const selectedSamples = useRecoilValue(fos.selectedSamples);
    const [open, setOpen] = useState(false);
    const [isImageSearch, setIsImageSearch] = useRecoilState(
      isImageSimilaritySearch
    );

    const [state, setState] = useState<fos.State.SortBySimilarityParameters>(
      () =>
        current
          ? current
          : { brainKey: null, distField: null, reverse: false, k: defaultK }
    );

    const setParameter = useCallback(
      (name: string, value) =>
        setState((state) => ({ ...state, [name]: value })),
      []
    );
    const hasNoSelectedSamples = [...selectedSamples].length == 0;
    const hasSorting = Boolean(current);
    const hasSimilarityKeys =
      useRecoilValue(availableSimilarityKeys({ modal, isImageSearch })).length >
      0;
    const choices = useRecoilValue(
      currentSimilarityKeys({ modal, isImageSearch })
    );
    const sortBySimilarity = useSortBySimilarity(close);
    const type = useRecoilValue(sortType(modal));

    const reset = useRecoilCallback(({ reset }) => () => {
      reset(fos.similarityParameters);
      reset(isImageSimilaritySearch);
    });

    useLayoutEffect(() => {
      choices.choices.length === 1 &&
        setParameter("brainKey", choices.choices[0]);
    }, [choices]);

    useLayoutEffect(() => {
      current && setState(current);
    }, [current]);

    let groupButtons: ButtonDetail[] = [
      {
        icon: "InfoIcon",
        arialLabel: "information",
        tooltipText: "Learn more about sorting by similarity",
        onClick: () => useExternalLink(SORT_BY_SIMILARITY),
        sx: { color: "#0288d1" },
      },
      {
        icon: "SettingsIcon",
        arialLabel: "Advanced settings",
        tooltipText: "advanced seettings",
        onClick: () => setOpen((o) => !o),
      },
    ];
    if (!isImageSearch && !hasSorting) {
      groupButtons = [
        {
          icon: "SearchIcon",
          arialLabel: "Submit",
          tooltipText: "Search by similarity to the provided text",
          onClick: () => sortBySimilarity(state),
          sx: { color: "#2e7d32" },
        },
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
                validator={(value) => true}
                value={(state.query as string) ?? ""}
                setter={(value) => setParameter("query", value)}
                onEnter={() => sortBySimilarity(state)}
              />
            )}
            {isImageSearch && !hasSorting && (
              <Button
                text={"Show similar samples"}
                title={`Search by similarity to the selected ${type}`}
                onClick={() => sortBySimilarity(state)}
                style={longButtonStyle}
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
                style={longButtonStyle}
              />
            )}
            <GroupButton buttons={groupButtons} />
          </div>
        )}
        {(!state.brainKey || !hasSimilarityKeys) && (
          <Warning hasSimilarityKeys isImageSearch />
        )}
        {open && hasSimilarityKeys && (
          <div>
            <div>
              Find the
              <div
                style={{
                  width: "30px",
                  margin: "2px",
                  display: "inline-block",
                }}
              >
                <Input
                  placeholder={"k"}
                  validator={(value) =>
                    value === "" || /^[0-9\b]+$/.test(value)
                  }
                  value={state.k === null ? "" : String(state.k)}
                  setter={(value) =>
                    setParameter("k", value === "" ? null : Number(value))
                  }
                />
              </div>
              <div
                style={{
                  width: "50px",
                  margin: "3px",
                  display: "inline-block",
                }}
              >
                <Button
                  text={state.reverse ? "least" : "most"}
                  title={`select most or least`}
                  onClick={() => setParameter("reverse", !state.reverse)}
                  style={{
                    margin: "auto",
                    height: "2rem",
                    borderRadius: 2,
                    textAlign: "center",
                    width: "50px",
                  }}
                ></Button>
              </div>
              similar samples using this brain key
              <RadioGroup
                choices={choices.choices}
                value={state.brainKey}
                setValue={(v) => setParameter("brainKey", v)}
              />
            </div>
            Optional: store the distance between each sample and the query in
            this field
            <div style={{ width: "60%" }}>
              <Input
                placeholder={"dist_field (default = None)"}
                validator={(value) => !value.startsWith("_")}
                value={state.distField ?? ""}
                setter={(value) =>
                  setParameter("distField", value === "" ? null : value)
                }
              />
            </div>
          </div>
        )}
      </Popout>
    );
  }
);

export default SortBySimilarity;
