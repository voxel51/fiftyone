import React, { Suspense, useLayoutEffect, useState } from "react";
import { animated } from "react-spring";
import {
  selector,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { http } from "../../shared/connection";

import { Entry } from "../CheckboxGroup";
import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import Results, { ResultsContainer } from "../Common/Results";
import { useExpand } from "../Filters/hooks";

const SettingsContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const Container = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
`;

interface HeatmapSettings {
  transparency: boolean;
  colorscale: string;
}

const colorscales = selector<string[]>({
  key: "colorscales",
  get: async () => {
    const scales = await fetch(`${http}/colorscales`);
    console.log(scales);
    return [];
  },
});

const fieldHeatmapSettings = selectorFamily<HeatmapSettings, string>({
  key: "heatmapFieldSettings",
  get: (path) => ({ get }) => {
    const defaultColorscale = useRecoilValue(selectors.colorscale);
    const defaultTransparency = useRecoilValue(
      selectors.colorscaleTransparency
    );
    const settings = useRecoilValue(atoms.stateDescription).settings;

    if (settings && settings[path]) {
      return settings[path];
    }

    return {
      transparency: defaultTransparency,
      colorscale: defaultColorscale,
    };
  },
  set: () => () => {},
});

const ResultsWrapper = ({
  entry,
  onSelect,
  search,
  active,
}: {
  entry: Entry;
  onSelect: (value: string) => void;
  search: string;
  active: string | null | undefined;
}) => {
  const scales = useRecoilValue(colorscales);

  return (
    <Results
      color={entry.color}
      active={active}
      onSelect={onSelect}
      results={scales
        .filter((scale) => scale.includes(search))
        .map((scale) => [scale, null])}
      highlight={entry.color}
    />
  );
};

interface Props {
  modal: boolean;
  expanded: boolean;
  entry: Entry;
}

const HeatmapSettings = ({ modal, expanded, entry }: Props) => {
  const [ref, props] = useExpand(expanded);
  const [{ colorscale, transparency }, setSettings] = useRecoilState(
    fieldHeatmapSettings(entry.path)
  );
  const [search, setSearch] = useState<string>("");
  const [focused, setFocused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [active, setActive] = useState(undefined);

  useLayoutEffect(() => {
    setSearch(colorscale);
  }, [colorscale]);

  return (
    <animated.div style={props}>
      <Container ref={ref}>
        <Header>Colorscale</Header>
        <SettingsContainer>
          <Input
            disabled={transparency}
            color={entry.color}
            placeholder={"Colorscale"}
            key={"colorscale"}
            value={search}
            setter={(value) => {
              setSearch(value);
              setActive(undefined);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <Checkbox
            name={"Use transparency"}
            color={entry.color}
            value={transparency}
            setValue={(value) =>
              setSettings({ transparency: value, colorscale })
            }
          />
          <ResultsContainer
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <Suspense fallback={"Loading"}>
              <ResultsWrapper
                active={active}
                entry={entry}
                search={search}
                onSelect={(value) =>
                  setSettings({ transparency, colorscale: value })
                }
              />
            </Suspense>
          </ResultsContainer>
        </SettingsContainer>
      </Container>
    </animated.div>
  );
};

export default React.memo(HeatmapSettings);
