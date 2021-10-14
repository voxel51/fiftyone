import React, { MouseEventHandler, useEffect, useState } from "react";
import styled from "styled-components";
import {
  useRecoilValue,
  useRecoilState,
  useRecoilCallback,
  RecoilState,
  RecoilValueReadOnly,
} from "recoil";
import {
  BarChart,
  BurstMode,
  Check,
  Close,
  FilterList,
  Help,
  LocalOffer,
  Note,
  PhotoLibrary,
  VideoLibrary,
  Visibility,
} from "@material-ui/icons";
import { animated, useSpring } from "react-spring";
import numeral from "numeral";

import CellHeader from "./CellHeader";
import DropdownCell from "./DropdownCell";
import * as filtering from "./Filters/filtered";
import CheckboxGrid from "./CheckboxGroup";
import { Entry } from "./CheckboxGroup";
import * as atoms from "../recoil/atoms";
import * as fieldAtoms from "./Filters/utils";
import * as selectors from "../recoil/selectors";
import { FILTERABLE_TYPES, FRAME_SUPPORT_FIELD } from "../utils/labels";
import { useTheme } from "../utils/hooks";
import { PillButton } from "./utils";
import { prettify } from "../utils/generic";
import * as filterAtoms from "./Filters/atoms";

const Container = styled.div`
  .MuiCheckbox-root {
    padding: 4px 8px 4px 4px;
  }

  ${CellHeader.Body} {
    display: flex;
    align-items: center;
    color: ${({ theme }) => theme.fontDark};

    span {
    }

    .label {
      text-transform: uppercase;
      flex-grow: 1;
      display: flex;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
  onSelect?: (entry: Entry) => void;
  handleClear: (event: Event) => void;
  entries: Entry[];
  icon: any;
  children?: any;
  pills?: Array<JSX.Element>;
  sort?: boolean;
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
    sort,
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
            {numSelected ? (
              <PillButton
                onClick={handleClear}
                highlight={false}
                open={false}
                icon={<Check />}
                title={"Clear displayed"}
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
          <CheckboxGrid
            entries={entries}
            onCheck={onSelect}
            modal={modal}
            sort={sort}
          />
        ) : (
          <span>No {title.toLocaleLowerCase()}</span>
        )}
        {children}
      </DropdownCell>
    );
  }
);

const makeTagEye = (
  matchedTags: Set<string>,
  name: string,
  theme,
  toggleFilter: MouseEventHandler,
  labels: boolean
): any => {
  const color = matchedTags.has(name) ? theme.font : theme.fontDark;
  return (
    <span
      title={`Only show ${
        labels ? "labels" : "samples"
      } with the "${name}" tag ${
        matchedTags.size ? "or other selected tags" : ""
      }`}
      onClick={toggleFilter}
      style={{
        cursor: "pointer",
        height: 20,
        width: 20,
        marginLeft: 8,
      }}
    >
      <Visibility
        style={{
          color,
          height: 20,
          width: 20,
        }}
      />
    </span>
  );
};
const makeClearMatchTags = (color, matchedTags, setMatchedTags) => {
  return matchedTags.size
    ? [
        <PillButton
          key="clear-match"
          highlight={false}
          icon={<Visibility />}
          text={numeral(matchedTags.size).format("0,0")}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setMatchedTags(new Set());
          }}
          title={"Clear matching"}
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

const useSampleTags = (modal) => {
  const allTags = useRecoilValue(filterAtoms.tagNames(false));
  const tags = useRecoilValue(filterAtoms.tagNames(modal));
  const [activeTags, setActiveTags] = useRecoilState(
    fieldAtoms.activeTags(modal)
  );
  const [matchedTags, setMatchedTags] = useRecoilState(
    filterAtoms.matchedTags({ modal, key: "sample" })
  );
  useEffect(() => {
    const newMatches = new Set<string>();
    matchedTags.forEach((tag) => {
      tags.includes(tag) && newMatches.add(tag);
    });

    newMatches.size !== matchedTags.size && setMatchedTags(newMatches);
  }, [matchedTags, allTags]);

  return { tags, activeTags, setActiveTags, matchedTags, setMatchedTags };
};

type TagsCellProps = {
  modal: boolean;
};

const SampleTagsCell = ({ modal }: TagsCellProps) => {
  const {
    tags,
    activeTags,
    setActiveTags,
    matchedTags,
    setMatchedTags,
  } = useSampleTags(modal);
  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, count] = [
    filterAtoms.filteredSampleTagCounts(modal),
    useRecoilValue(filterAtoms.sampleTagCounts(modal)),
  ];

  const { singular: element } = useRecoilValue(selectors.elementNames);
  const theme = useTheme();

  return (
    <Cell
      label={`${element} tags`}
      icon={<Note />}
      pills={
        !modal && makeClearMatchTags(theme.font, matchedTags, setMatchedTags)
      }
      entries={tags
        .filter((t) => count[t])
        .map((name) => {
          const color = colorMap("tags." + name);
          return {
            name,
            disabled: false,
            hideCheckbox: modal,
            hasDropdown: false,
            selected: activeTags.includes(name),
            color,
            title: name,
            canFilter: !modal,
            path: `tags.${name}`,
            key: name,
            type: "tags",
            count: !modal ? count[name] : null,
            value: modal ? (
              count[name] > 0 ? (
                <Check style={{ marginTop: 3, color }} />
              ) : (
                <Close style={{ marginTop: 3, color }} />
              )
            ) : null,
            subCountAtom,
            icon: modal
              ? null
              : makeTagEye(
                  matchedTags,
                  name,
                  theme,
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
                  },
                  false
                ),
            modal,
          };
        })}
      onSelect={({ name, selected }) =>
        !modal &&
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
      title={`${element} tags`}
    />
  );
};

const useLabelTags = (modal, count) => {
  const allTags = useRecoilValue(filterAtoms.labelTagNames(false));
  let tags = useRecoilValue(filterAtoms.labelTagNames(modal));
  const [activeTags, setActiveTags] = useRecoilState(
    fieldAtoms.activeLabelTags(modal)
  );
  const [matchedTags, setMatchedTags] = useRecoilState(
    filterAtoms.matchedTags({ modal, key: "label" })
  );
  useEffect(() => {
    const newMatches = new Set<string>();
    matchedTags.forEach((tag) => {
      tags.includes(tag) && newMatches.add(tag);
    });

    newMatches.size !== matchedTags.size && setMatchedTags(newMatches);
  }, [matchedTags, allTags]);

  !modal && (tags = tags.filter((t) => count[t]));

  return {
    tags,
    activeTags,
    setActiveTags,
    matchedTags,
    setMatchedTags,
  };
};

const LabelTagsCell = ({ modal }: TagsCellProps) => {
  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, count] = [
    filterAtoms.filteredLabelTagCounts(modal),
    useRecoilValue(filterAtoms.labelTagCounts(modal)),
  ];

  const {
    tags,
    activeTags,
    setActiveTags,
    matchedTags,
    setMatchedTags,
  } = useLabelTags(modal, count);

  const theme = useTheme();

  return (
    <Cell
      label="Label tags"
      icon={<LocalOffer />}
      pills={makeClearMatchTags(theme.font, matchedTags, setMatchedTags)}
      entries={tags.map((name) => {
        const color = colorMap("_label_tags." + name);
        return {
          canFilter: true,
          name,
          disabled: false,
          hideCheckbox: modal,
          hasDropdown: false,
          selected: activeTags.includes(name),
          color,
          title: name,
          type: "label tags",
          path: "_label_tags." + name,
          key: name,
          modal,
          count: count[name] || 0,
          subCountAtom,
          icon: makeTagEye(
            matchedTags,
            name,
            theme,
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
            },
            true
          ),
        };
      })}
      onSelect={({ name, selected }) => {
        !modal &&
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
  const video = useRecoilValue(selectors.isVideoDataset);
  const types = useRecoilValue(selectors.labelTypesMap);

  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, count] = [
    filterAtoms.filteredLabelCounts({ key, modal }),
    useRecoilValue(filterAtoms.labelCounts({ key, modal })),
  ];

  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();

  return (
    <Cell
      label={frames ? "Frame labels" : "Labels"}
      icon={
        frames ? <BurstMode /> : video ? <VideoLibrary /> : <PhotoLibrary />
      }
      pills={useClearFiltersPill(
        frames
          ? filtering.numFilteredFrameLabels(modal)
          : filtering.numFilteredLabels(modal),
        frames
          ? filtering.filteredFrameLabels(modal)
          : filtering.filteredLabels(modal)
      )}
      sort={false}
      entries={labels.map((name) => {
        const path = frames ? "frames." + name : name;
        return {
          name,
          disabled: false,
          hideCheckbox: false,
          hasDropdown: FILTERABLE_TYPES.includes(types[path]),
          selected: activeLabels.includes(path),
          color: colorByLabel ? theme.brand : colorMap(path),
          title: name,
          path: path,
          type: "labels",
          modal,
          count: count ? count[path] : null,
          subCountAtom,
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

const useClearFiltersPill = (
  numFilteredAtom: RecoilValueReadOnly<number>,
  filteredAtom: RecoilState<string[]>
) => {
  const theme = useTheme();
  const clear = useRecoilCallback(
    ({ set }) => async () => {
      set(filteredAtom, []);
    },
    [filteredAtom]
  );

  const numFiltered = useRecoilValue(numFilteredAtom);

  return numFiltered > 0
    ? [
        <PillButton
          key="clear-match"
          highlight={false}
          icon={<FilterList />}
          text={numeral(numFiltered).format("0,0")}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            clear();
          }}
          title={"Clear filters"}
          open={false}
          style={{
            marginLeft: "0.25rem",
            height: "1.5rem",
            fontSize: "0.8rem",
            lineHeight: "1rem",
            color: theme.font,
          }}
        />,
      ]
    : null;
};

type OthersCellProps = {
  modal: boolean;
};

const OthersCell = ({ modal }: OthersCellProps) => {
  const scalars = useRecoilValue(selectors.primitiveNames("sample"));
  const [activeScalars, setActiveScalars] = useRecoilState(
    fieldAtoms.activeScalars(modal)
  );
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();
  const dbFields = useRecoilValue(selectors.primitivesDbMap("sample"));

  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, count] = [
    filterAtoms.filteredScalarCounts(modal),
    useRecoilValue(filterAtoms.scalarCounts(modal)),
  ];
  const types = useRecoilValue(selectors.primitivesMap("sample"));

  return (
    <Cell
      label="Other fields"
      icon={<BarChart />}
      pills={
        modal
          ? null
          : useClearFiltersPill(
              filtering.numFilteredScalars(modal),
              filtering.filteredScalars(modal)
            )
      }
      sort={false}
      entries={scalars
        .filter((name) => !(["filepath", "id"].includes(name) && modal))
        .map((name) => {
          const value = modal ? count[dbFields[name]] : null;
          return {
            name,
            disabled: false,
            hideCheckbox: modal,
            hasDropdown: !modal || Array.isArray(value),
            selected: activeScalars.includes(name),
            color: colorByLabel ? theme.brand : colorMap(name),
            title:
              modal &&
              (!Array.isArray(value) || types[name] === FRAME_SUPPORT_FIELD)
                ? prettify(value, false)
                : name,
            value:
              modal &&
              (!Array.isArray(value) || types[name] === FRAME_SUPPORT_FIELD)
                ? prettify(value, false)
                : null,
            path: name,
            count:
              count === null
                ? null
                : modal &&
                  Array.isArray(value) &&
                  types[name] !== FRAME_SUPPORT_FIELD
                ? value.length
                : count[name],
            type: "values",
            modal,
            subCountAtom,
            disableList: modal,
            canFilter: !modal || Array.isArray(value),
          };
        })}
      onSelect={
        !modal
          ? ({ name, selected }) => {
              setActiveScalars(
                selected
                  ? [name, ...activeScalars]
                  : activeScalars.filter((t) => t !== name)
              );
            }
          : null
      }
      handleClear={(e) => {
        e.stopPropagation();
        setActiveScalars([]);
      }}
      modal={modal}
      title={"Other fields"}
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
        path: e,
        title: e,
        data: null,
        disabled: true,
        hideCheckbox: true,
        selected: false,
      }))}
      title={"Unsupported fields"}
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

export const Button = ({
  onClick,
  text,
  children = null,
  style,
  color = null,
  title = null,
}) => {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  color = color ?? theme.brand;
  const props = useSpring({
    backgroundColor: hover ? color : theme.background,
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
      title={title ?? text}
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
  style?: React.CSSProperties;
};

const FieldsSidebar = React.forwardRef(
  ({ modal, style }: FieldsSidebarProps, ref) => {
    const mediaType = useRecoilValue(selectors.mediaType);
    const isVideo = mediaType === "video";
    const moreStyles = modal ? { height: "auto", overflow: "unset" } : {};

    return (
      <Container ref={ref} style={{ ...style, ...moreStyles }}>
        <SampleTagsCell modal={modal} />
        <LabelTagsCell modal={modal} />
        <LabelsCell modal={modal} frames={false} />
        {isVideo && <LabelsCell modal={modal} frames={true} />}
        <OthersCell modal={modal} />
        <UnsupportedCell modal={modal} />
      </Container>
    );
  }
);

export default FieldsSidebar;
