import React from "react";
import { Checkbox } from "@material-ui/core";
import { LocalOffer, Visibility } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import { selectorFamily, useRecoilState, useRecoilValue } from "recoil";

import * as colorAtoms from "../../../recoil/color";
import * as schemaAtoms from "../../../recoil/schema";
import { State } from "../../../recoil/types";
import { elementNames } from "../../../recoil/view";

import { NameAndCountContainer } from "../../utils";

import { LabelTagCounts, PathEntryCounts, tagIsMatched } from "./EntryCounts";
import RegularEntry from "./RegularEntry";
import { useTheme } from "@fiftyone/components";

const ACTIVE_ATOM = {
  [State.TagKey.LABEL]: schemaAtoms.activeLabelTags,
  [State.TagKey.SAMPLE]: schemaAtoms.activeTags,
};

const tagIsActive = selectorFamily<
  boolean,
  { key: State.TagKey; tag: string; modal: boolean }
>({
  key: "tagIsActive",
  get: ({ key, tag, modal }) => ({ get }) =>
    get(ACTIVE_ATOM[key](modal)).includes(tag),
  set: ({ key, tag, modal }) => ({ get, set }) => {
    const atom = ACTIVE_ATOM[key](modal);
    const current = get(atom);

    set(
      atom,
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [tag, ...current]
    );
  },
});

type MatchEyeProps = {
  name: string;
  elementsName: string;
  onClick: () => void;
  matched: boolean;
};

const MatchEye = ({ elementsName, name, matched, onClick }: MatchEyeProps) => {
  const theme = useTheme();
  const color = matched ? theme.font : theme.fontDark;
  const title = `Only show ${elementsName} with the "${name}" tag ${
    matched ? "or other selected tags" : ""
  }`;

  return (
    <span
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
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

const FilterableTagEntry = ({
  entryKey,
  modal,
  tag,
  tagKey,
  trigger,
}: {
  entryKey: string;
  modal: boolean;
  tagKey: State.TagKey;
  tag: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}) => {
  const theme = useTheme();
  const [active, setActive] = useRecoilState(
    tagIsActive({ key: tagKey, modal, tag })
  );

  const elementsName =
    tagKey === State.TagKey.SAMPLE
      ? useRecoilValue(elementNames).plural
      : "labels";

  const [matched, setMatched] = useRecoilState(
    tagIsMatched({ key: tagKey, modal, tag })
  );
  const color = useRecoilValue(
    colorAtoms.pathColor({ path: tag, modal, tag: tagKey })
  );
  const { backgroundColor } = useSpring({
    backgroundColor: matched ? "#6C757D" : theme.backgroundLight,
  });

  return (
    <RegularEntry
      entryKey={entryKey}
      backgroundColor={backgroundColor}
      clickable
      color={color}
      heading={
        <>
          {modal ? (
            <LocalOffer style={{ margin: 2, height: 21, width: 21, color }} />
          ) : (
            <Checkbox
              disableRipple={true}
              title={`Show ${elementsName} with the "${tag}" tag`}
              checked={active}
              style={{
                color: active ? color : theme.fontDark,
                padding: 0,
              }}
            />
          )}
          <NameAndCountContainer>
            <span>{tag}</span>
            {tagKey === State.TagKey.LABEL ? (
              <LabelTagCounts modal={modal} tag={tag} />
            ) : (
              <PathEntryCounts path={`tags.${tag}`} modal={modal} />
            )}

            <MatchEye
              name={tag}
              elementsName={elementsName}
              onClick={() => setMatched(!matched)}
              matched={matched}
            />
          </NameAndCountContainer>
        </>
      }
      onClick={() => setActive(!active)}
      title={tag}
      trigger={trigger}
    />
  );
};

export default React.memo(FilterableTagEntry);
