import React from "react";
import { Checkbox } from "@mui/material";
import { LocalOffer, Visibility } from "@mui/icons-material";
import { useSpring } from "@react-spring/core";
import { selectorFamily, useRecoilState, useRecoilValue } from "recoil";

import { NameAndCountContainer } from "../../utils";

import { LabelTagCounts, PathEntryCounts, tagIsMatched } from "./EntryCounts";
import RegularEntry from "./RegularEntry";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import Color from "color";

const ACTIVE_ATOM = {
  [fos.State.TagKey.LABEL]: fos.activeLabelTags,
  [fos.State.TagKey.SAMPLE]: fos.activeTags,
};

const tagIsActive = selectorFamily<
  boolean,
  { key: fos.State.TagKey; tag: string; modal: boolean }
>({
  key: "tagIsActive",
  get:
    ({ key, tag, modal }) =>
    ({ get }) =>
      get(ACTIVE_ATOM[key](modal)).includes(tag),
  set:
    ({ key, tag, modal }) =>
    ({ get, set }) => {
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
  const color = matched ? theme.text.primary : theme.text.secondary;
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
  modal,
  tag,
  tagKey,
}: {
  modal: boolean;
  tagKey: fos.State.TagKey;
  tag: string;
}) => {
  const theme = useTheme();
  const [active, setActive] = useRecoilState(
    tagIsActive({ key: tagKey, modal, tag })
  );

  const elementsName =
    tagKey === fos.State.TagKey.SAMPLE
      ? useRecoilValue(fos.elementNames).plural
      : "labels";

  const [matched, setMatched] = useRecoilState(
    tagIsMatched({ key: tagKey, modal, tag })
  );
  const color = useRecoilValue(
    fos.pathColor({ path: tag, modal, tag: tagKey })
  );
  const { backgroundColor } = useSpring({
    backgroundColor: matched
      ? Color(color).alpha(0.25).string()
      : theme.background.level1,
  });

  return (
    <RegularEntry
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
                color: active ? color : theme.text.secondary,
                padding: 0,
              }}
            />
          )}
          <NameAndCountContainer>
            <span>{tag}</span>
            {tagKey === fos.State.TagKey.LABEL ? (
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
    />
  );
};

export default React.memo(FilterableTagEntry);
