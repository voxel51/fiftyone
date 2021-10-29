import React, { useLayoutEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Check, Note, Visibility } from "@material-ui/icons";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import * as viewAtoms from "../../recoil/view";
import { useTheme } from "../../utils/hooks";

import { PlusMinusButton } from "../DropdownHandle";
import { PillButton } from "../utils";

import { FieldHeader } from "./utils";

const SampleTagsCell = React.memo(({ modal }: { modal: boolean }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const { singular } = useRecoilValue(viewAtoms.elementNames);
  const tags = useRecoilValue(
    aggregationAtoms.values({ extended: false, modal, path: "tags" })
  );
  const counts = useRecoilValue(
    aggregationAtoms.counts({ extended: false, path: "tags", modal })
  );
  const title = `${singular} tags`;

  const allTags = useRecoilValue(
    aggregationAtoms.values({ extended: false, modal: false, path: "tags" })
  );
  const [activeTags, setActiveTags] = useRecoilState(
    schemaAtoms.activeTags(modal)
  );
  const [matchedTags, setMatchedTags] = useRecoilState(
    filterAtoms.matchedTags({ modal, key: "sample" })
  );
  useLayoutEffect(() => {
    const newMatches = new Set<string>();
    matchedTags.forEach((tag) => {
      tags.includes(tag) && newMatches.add(tag);
    });

    newMatches.size !== matchedTags.size && setMatchedTags(newMatches);
  }, [matchedTags, allTags]);

  return (
    <>
      <FieldHeader
        title={title}
        icon={PlusMinusButton}
        onClick={() => setExpanded(!expanded)}
        expanded={expanded}
      >
        <Note style={{ marginRight: "0.5rem" }} />
        {title}
        {activeTags.length > 0 && (
          <PillButton
            onClick={() => setActiveTags([])}
            highlight={false}
            open={false}
            icon={<Check />}
            title={"Clear displayed"}
            text={`${activeTags.length}`}
            style={{
              height: "1.5rem",
              fontSize: "0.8rem",
              lineHeight: "1rem",
              color: theme.font,
            }}
          />
        )}
        {matchedTags.size > 0 && (
          <PillButton
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setMatchedTags(new Set());
            }}
            highlight={false}
            open={false}
            icon={<Visibility />}
            title={"Clear matching"}
            text={`${matchedTags.size}`}
            style={{
              height: "1.5rem",
              fontSize: "0.8rem",
              lineHeight: "1rem",
              color: theme.font,
            }}
          />
        )}
      </FieldHeader>
      {expanded &&
        tags &&
        tags.map((tag) => {
          return <div>{tag}</div>;
        })}
    </>
  );
});

export default SampleTagsCell;
