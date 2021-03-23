import React, { useState } from "react";
import styled from "styled-components";
import { useRecoilValue, useRecoilState } from "recoil";
import {
  BarChart,
  Check,
  Close,
  Help,
  Label,
  LocalOffer,
  PhotoLibrary,
} from "@material-ui/icons";
import { animated, useSpring } from "react-spring";
import numeral from "numeral";

import CellHeader from "./CellHeader";
import CheckboxGrid from "./CheckboxGroup";
import DropdownCell from "./DropdownCell";
import { Entry } from "./CheckboxGroup";
import * as atoms from "../recoil/atoms";
import { labelModalTagCounts } from "./Actions/utils";
import * as fieldAtoms from "./Filters/utils";
import * as labelAtoms from "./Filters/LabelFieldFilters.state";
import * as selectors from "../recoil/selectors";
import { stringify, FILTERABLE_TYPES } from "../utils/labels";
import { useTheme } from "../utils/hooks";
import { Target } from "../icons";
import { PillButton } from "./utils";

const Container = styled.div`
  .MuiCheckbox-root {
    padding: 4px 8px 4px 4px;
  }

  ${CellHeader.Body} {
    display: flex;
    align-items: center;
    color: ${({ theme }) => theme.fontDark};

    * {
      display: flex;
    }

    .label {
      text-transform: uppercase;
    }

    .push {
      margin-left: auto;
    }
    .icon {
      margin-left: 2px;
    }
  }

  .left-icon {
    margin-right: 4px;
  }
`;

type CellProps = {
  label: string;
  title: string;
  modal: boolean;
  onSelect: (entry: Entry) => void;
  handleClear: () => void;
  entries: Entry[];
  icon: any;
  children?: any;
  pills?: Array<typeof PillButton>;
};

const Cell = React.memo(
  ({
    label,
    icon,
    entries,
    handleClear,
    onSelect,
    title,
    modal,
    children,
    pills = [],
  }: CellProps) => {
    const [expanded, setExpanded] = useState(true);
    const numSelected = entries.filter((e) => e.selected).length;
    const theme = useTheme();

    return (
      <DropdownCell
        label={
          <>
            {icon ? <span className="left-icon">{icon}</span> : null}
            <span className="label">{label}</span>
            <span className="push" />
            {numSelected ? (
              <PillButton
                onClick={handleClear}
                highlight={false}
                open={false}
                icon={<Check />}
                text={numeral(numSelected).format("0,0")}
                style={{
                  height: "1.5rem",
                  fontSize: "0.8rem",
                  lineHeight: "1rem",
                  color: theme.font,
                }}
              />
            ) : null}
            {pills}
          </>
        }
        title={title}
        expanded={expanded}
        onExpand={setExpanded}
      >
        {entries.length ? (
          <CheckboxGrid entries={entries} onCheck={onSelect} modal={modal} />
        ) : (
          <span>No {title.toLocaleLowerCase()}</span>
        )}
        {children}
      </DropdownCell>
    );
  }
);

const makeData = (filteredCount: number, totalCount: number): string => {
  if (
    typeof filteredCount === "number" &&
    filteredCount !== totalCount &&
    typeof totalCount === "number"
  ) {
    return `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`;
  } else if (filteredCount === null) {
    return null;
  } else if (typeof totalCount === "number") {
    return totalCount.toLocaleString();
  }
  return totalCount;
};

const makeTagData = (
  filteredCount: number,
  totalCount: number,
  color: string,
  toggleFilter: () => void
): any => {
  return (
    <>
      <span>{makeData(filteredCount, totalCount)}</span>
      <Target
        title={"Only matches"}
        style={{
          color,
          height: 20,
          width: 20,
          marginLeft: 8,
          cursor: "pointer",
        }}
        onClick={toggleFilter}
      />
    </>
  );
};
const makeClearMatchTags = (color, matchedTags, setMatchedTags) => {
  return matchedTags.size
    ? [
        <PillButton
          highlight={false}
          icon={<Target />}
          text={numeral(matchedTags.size).format("0,0")}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setMatchedTags(new Set());
          }}
          open={false}
          style={{
            marginLeft: "0.25rem",
            height: "1.5rem",
            fontSize: "0.8rem",
            lineHeight: "1rem",
            color,
          }}
        />,
      ]
    : [];
};

type TagsCellProps = {
  modal: boolean;
};

const SampleTagsCell = ({ modal }: TagsCellProps) => {
  const tags = useRecoilValue(selectors.tagNames);
  const [activeTags, setActiveTags] = useRecoilState(
    fieldAtoms.activeTags(modal)
  );
  const [matchedTags, setMatchedTags] = useRecoilState(
    selectors.matchedTags({ modal, key: "sample" })
  );
  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, countAtom] = modal
    ? [null, selectors.tagSampleModalCounts]
    : [selectors.filteredTagSampleCounts, selectors.tagSampleCounts];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();

  return (
    <Cell
      label="Sample tags"
      icon={<LocalOffer />}
      pills={makeClearMatchTags(theme.font, matchedTags, setMatchedTags)}
      entries={tags
        .filter((t) => count[t])
        .map((name) => {
          const color = colorByLabel ? theme.brand : colorMap["tags." + name];
          return {
            name,
            disabled: false,
            hideCheckbox: modal,
            hasDropdown: false,
            selected: activeTags.includes(name),
            color,
            title: name,
            path: "tags." + name,
            data: modal ? (
              count[name] > 0 ? (
                <Check style={{ color }} />
              ) : (
                <Close style={{ color }} />
              )
            ) : (
              makeTagData(
                subCount[name],
                count[name],
                matchedTags.has(name) ? theme.font : theme.fontDark,
                (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const newMatch = new Set(matchedTags);
                  if (matchedTags.has(name)) {
                    newMatch.delete(name);
                  } else {
                    newMatch.add(name);
                  }
                  setMatchedTags(newMatch);
                }
              )
            ),
            totalCount: count[name],
            filteredCount: modal ? null : subCount[name],
            modal,
          };
        })}
      onSelect={({ name, selected }) =>
        setActiveTags(
          selected
            ? [name, ...activeTags]
            : activeTags.filter((t) => t !== name)
        )
      }
      handleClear={(e) => {
        e.stopPropagation();
        setActiveTags([]);
      }}
      modal={modal}
      title={"Sample tags"}
    />
  );
};

const LabelTagsCell = ({ modal }: TagsCellProps) => {
  let tags = useRecoilValue(selectors.labelTagNames);
  const [activeTags, setActiveTags] = useRecoilState(
    fieldAtoms.activeLabelTags(modal)
  );
  const [matchedTags, setMatchedTags] = useRecoilState(
    selectors.matchedTags({ modal, key: "label" })
  );
  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, countAtom] = modal
    ? [labelModalTagCounts(true), labelModalTagCounts(false)]
    : [selectors.filteredLabelTagSampleCounts, selectors.labelTagSampleCounts];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();
  const hasFilters = useRecoilValue(selectors.hasFilters);

  !modal && (tags = tags.filter((t) => count[t]));

  return (
    <Cell
      label="Label tags"
      icon={<LocalOffer />}
      pills={makeClearMatchTags(theme.font, matchedTags, setMatchedTags)}
      entries={tags.map((name) => {
        const color = colorByLabel
          ? theme.brand
          : colorMap["_label_tags." + name];
        return {
          canFilter: true,
          name,
          disabled: false,
          hideCheckbox: modal,
          hasDropdown: false,
          selected: activeTags.includes(name),
          color,
          title: name,
          path: "_label_tags." + name,
          data: makeTagData(
            hasFilters && !modal && !subCount[name] ? 0 : subCount[name],
            count[name] ?? 0,
            matchedTags.has(name) ? theme.font : theme.fontDark,
            (e) => {
              e.stopPropagation();
              e.preventDefault();
              const newMatch = new Set(matchedTags);
              if (matchedTags.has(name)) {
                newMatch.delete(name);
              } else {
                newMatch.add(name);
              }
              setMatchedTags(newMatch);
            }
          ),
          totalCount: count[name],
          filteredCount: modal ? null : subCount[name],
          modal,
        };
      })}
      onSelect={({ name, selected }) => {
        setActiveTags(
          selected
            ? [name, ...activeTags]
            : activeTags.filter((t) => t !== name)
        );
      }}
      handleClear={(e) => {
        e.stopPropagation();
        setActiveTags([]);
      }}
      modal={modal}
      title={"Label tags"}
    />
  );
};

type LabelsCellProps = {
  modal: boolean;
  frames: boolean;
};

const LabelsCell = ({ modal, frames }: LabelsCellProps) => {
  const key = frames ? "frame" : "sample";
  const labels = useRecoilValue(selectors.labelNames(key));
  const [activeLabels, setActiveLabels] = useRecoilState(
    fieldAtoms.activeLabels({ modal, frames })
  );
  const types = useRecoilValue(selectors.labelTypesMap);

  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, countAtom] = modal
    ? [
        labelAtoms.filteredLabelSampleModalCounts(key),
        labelAtoms.labelSampleModalCounts(key),
      ]
    : [
        labelAtoms.filteredLabelSampleCounts(key),
        labelAtoms.labelSampleCounts(key),
      ];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();

  return (
    <Cell
      label={frames ? "Frame label fields" : "Label fields"}
      icon={
        frames ? (
          <PhotoLibrary />
        ) : (
          <Label style={{ transform: "rotate(180deg)" }} />
        )
      }
      entries={labels.map((name) => {
        const path = frames ? "frames." + name : name;
        return {
          name,
          disabled: false,
          hideCheckbox: false,
          hasDropdown: FILTERABLE_TYPES.includes(types[path]),
          selected: activeLabels.includes(path),
          color: colorByLabel ? theme.brand : colorMap[path],
          title: name,
          path,
          data:
            count && subCount ? makeData(subCount[name], count[name]) : null,
          totalCount: count ? count[name] : null,
          filteredCount: subCount ? subCount[name] : null,
          modal,
          labelType: types[path],
          canFilter: true,
        };
      })}
      onSelect={({ name, selected }) => {
        if (frames) {
          name = "frames." + name;
        }
        setActiveLabels(
          selected
            ? [name, ...activeLabels]
            : activeLabels.filter((t) => t !== name)
        );
      }}
      handleClear={(e) => {
        e.stopPropagation();
        setActiveLabels([]);
      }}
      modal={modal}
      title={frames ? "Frame label fields" : "Label fields"}
    />
  );
};

type ScalarsCellProps = {
  modal: boolean;
};

const ScalarsCell = ({ modal }: ScalarsCellProps) => {
  const scalars = useRecoilValue(selectors.scalarNames("sample"));
  const [activeScalars, setActiveScalars] = useRecoilState(
    fieldAtoms.activeScalars(modal)
  );

  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, countAtom] = modal
    ? [null, selectors.modalSample]
    : [
        labelAtoms.filteredLabelSampleCounts("sample"),
        labelAtoms.labelSampleCounts("sample"),
      ];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();

  return (
    <Cell
      label="Scalar fields"
      icon={<BarChart />}
      entries={scalars.map((name) => ({
        name,
        disabled: false,
        hideCheckbox: modal,
        hasDropdown: !modal,
        selected: activeScalars.includes(name),
        color: colorByLabel ? theme.brand : colorMap[name],
        title: name,
        path: name,
        data:
          count && subCount && !modal
            ? makeData(subCount[name], count[name])
            : modal
            ? stringify(count[name])
            : null,
        totalCount: !modal && count ? count[name] : null,
        filteredCount: !modal && subCount ? subCount[name] : null,
        modal,
        canFilter: !modal,
      }))}
      onSelect={({ name, selected }) => {
        setActiveScalars(
          selected
            ? [name, ...activeScalars]
            : activeScalars.filter((t) => t !== name)
        );
      }}
      handleClear={(e) => {
        e.stopPropagation();
        setActiveScalars([]);
      }}
      modal={modal}
      title={"Scalar fields"}
    />
  );
};

type UnsupportedCellProps = {
  modal: boolean;
};

const UnsupportedCell = ({ modal }: UnsupportedCellProps) => {
  const unsupported = useRecoilValue(fieldAtoms.unsupportedFields);
  return unsupported.length ? (
    <Cell
      label={"Unsupported fields"}
      icon={<Help />}
      entries={unsupported.map((e) => ({
        name: e,
        title: e,
        data: null,
        disabled: true,
        hideCheckbox: true,
        selected: false,
      }))}
      title={"Currently unsupported"}
      modal={modal}
    />
  ) : null;
};

const ButtonDiv = animated(styled.div`
  cursor: pointer;
  margin-left: 0;
  margin-right: 0;
  padding: 2.5px 0.5rem;
  border-radius: 3px;
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
`);

const OptionTextDiv = animated(styled.div`
  padding-right: 0.25rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  color: inherit;
  line-height: 1.7;
  & > span {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
`);

export const OptionText = ({ style, children }) => {
  return (
    <OptionTextDiv style={style}>
      <span>{children}</span>
    </OptionTextDiv>
  );
};

export const Button = ({ onClick, text, children, style }) => {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  const props = useSpring({
    backgroundColor: hover ? theme.brand : theme.background,
    color: hover ? theme.font : theme.fontDark,
    config: {
      duration: 150,
    },
  });
  return (
    <ButtonDiv
      style={{ ...props, userSelect: "none", ...style }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={text}
    >
      <OptionText style={{ fontWeight: "bold", width: "100%" }}>
        {text}
      </OptionText>
      {children}
    </ButtonDiv>
  );
};

type FieldsSidebarProps = {
  modal: boolean;
  style: object;
};

const FieldsSidebar = React.forwardRef(
  ({ modal, style }: FieldsSidebarProps, ref) => {
    const mediaType = useRecoilValue(selectors.mediaType);
    const isVideo = mediaType === "video";
    const moreStyles = modal ? { height: "auto", overflow: "auto hidden" } : {};

    return (
      <Container ref={ref} style={{ ...style, ...moreStyles }}>
        <SampleTagsCell modal={modal} />
        <LabelTagsCell modal={modal} />
        <LabelsCell modal={modal} frames={false} />
        {isVideo && <LabelsCell modal={modal} frames={true} />}
        <ScalarsCell modal={modal} />
        <UnsupportedCell modal={modal} />
      </Container>
    );
  }
);

export default FieldsSidebar;
