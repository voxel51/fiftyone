import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import SettingsIcon from "@mui/icons-material/Settings";
import InfoIcon from "@mui/icons-material/Info";
import SearchIcon from "@mui/icons-material/Search";
import {
  atom,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";

import { SORT_BY_SIMILARITY } from "../../utils/links";
import Input from "../Common/Input";
import RadioGroup from "../Common/RadioGroup";
import Popout from "./Popout";

import {
  useTheme,
  PopoutSectionTitle,
  IconButton,
  Tooltip,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Button } from "../utils";
import styled from "styled-components";
import { ActionOption } from "./Common";
import { useExternalLink } from "@fiftyone/components/src/components/ExternalLink/ExternalLink";
import {
  availableSimilarityKeys,
  currentSimilarityKeys,
  sortType,
  useSortBySimilarity,
} from "./utils";

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: row;
  margin: auto 0;
`;

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

    const theme = useTheme();

    useLayoutEffect(() => {
      choices.choices.length === 1 &&
        setParameter("brainKey", choices.choices[0]);
    }, [choices]);

    useLayoutEffect(() => {
      current && setState(current);
    }, [current]);

    useEffect(() => {
      if (!hasNoSelectedSamples) {
        setIsImageSearch(true);
      }
      if (!hasSorting && hasNoSelectedSamples) {
        setIsImageSearch(false);
      }
    }, [hasNoSelectedSamples, hasSorting]);

    const onInfoLink = () => {
      useExternalLink(SORT_BY_SIMILARITY);
    };

    const renderAdvanceSettings: () => JSX.Element = () => {
      return (
        <div>
          <div>
            Find the
            <div style={{ width: "30px", display: "inline-block" }}>
              <Input
                placeholder={"k"}
                validator={(value) => value === "" || /^[0-9\b]+$/.test(value)}
                value={state.k === null ? "" : String(state.k)}
                setter={(value) => {
                  setParameter("k", value === "" ? null : Number(value));
                }}
              />
            </div>
            <div style={{ width: "50px", display: "inline-block" }}>
              <Button
                text={state.reverse ? "least" : "most"}
                title={`select most or least`}
                onClick={() => {
                  setParameter("reverse", !state.reverse);
                }}
                style={{
                  margin: "auto 0",
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
          Optional: store the distance between each sample and the query in this
          field
          <div style={{ width: "60%" }}>
            <Input
              placeholder={"dist_field (default = None)"}
              validator={(value) => !value.startsWith("_")}
              value={state.distField ?? ""}
              setter={(value) => {
                setParameter("distField", value === "" ? null : value);
              }}
            />
          </div>
        </div>
      );
    };

    const renderWarning: () => JSX.Element = () => {
      return (
        <>
          {!hasSimilarityKeys && (
            <PopoutSectionTitle style={{ fontSize: 12 }}>
              {isImageSearch
                ? "No available brain keys"
                : "No brain keys support text prompts"}
            </PopoutSectionTitle>
          )}
          <PopoutSectionTitle>
            <ActionOption
              href={SORT_BY_SIMILARITY}
              text={"Search by text similarity"}
              title={"About sorting by similarity"}
              style={{
                background: "unset",
                color: theme.text.primary,
                paddingTop: 0,
                paddingBottom: 0,
              }}
              svgStyles={{ height: "1rem", marginTop: 7.5 }}
            />
          </PopoutSectionTitle>
        </>
      );
    };

    const longButtonStyle = {
      margin: "0.25rem",
      height: "2rem",
      borderRadius: 2,
      textAlign: "center",
      width: "185px",
    };

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
                value={state.query ?? ""}
                setter={(value) => {
                  setParameter("query", value);
                }}
                disabled={!state.brainKey}
                onEnter={() => sortBySimilarity(state)}
              />
            )}
            {isImageSearch && !hasSorting && (
              <Button
                text={"Show similar samples"}
                title={`Search by similarity to the selected ${type}`}
                onClick={() => {
                  sortBySimilarity(state);
                }}
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
            <ButtonGroup>
              {!isImageSearch && !hasSorting && (
                <Tooltip
                  text={"Search by similarity to the provided text"}
                  placement={"top-center"}
                >
                  <div onClick={() => sortBySimilarity(state)}>
                    <IconButton
                      aria-label="submit"
                      size="small"
                      disableRipple
                      sx={{ color: "#2e7d32" }}
                    >
                      <SearchIcon />
                    </IconButton>
                  </div>
                </Tooltip>
              )}
              <Tooltip
                text="Learn more about sorting by similarity"
                placement={"top-center"}
              >
                <div onClick={() => onInfoLink()}>
                  <IconButton
                    aria-label="information"
                    size="small"
                    disableRipple
                    sx={{ color: "#0288d1" }}
                  >
                    <InfoIcon />
                  </IconButton>
                </div>
              </Tooltip>
              <Tooltip text="Advanced settings" placement={"top-center"}>
                <div onClick={() => setOpen((o) => !o)}>
                  <IconButton aria-label="settings" size="small">
                    <SettingsIcon />
                  </IconButton>
                </div>
              </Tooltip>
            </ButtonGroup>
          </div>
        )}
        {(!state.brainKey || !hasSimilarityKeys) && renderWarning()}
        {open && hasSimilarityKeys && renderAdvanceSettings()}
      </Popout>
    );
  }
);

export default SortBySimilarity;
