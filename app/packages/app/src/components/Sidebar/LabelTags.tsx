import React, { useLayoutEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Check, Visibility } from "@material-ui/icons";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import * as viewAtoms from "../../recoil/view";

import { FieldHeader, MatchEye, usePills } from "./utils";
import { PathEntry } from "./Entries";
import {
  EMBEDDED_DOCUMENT_FIELD,
  LABEL_DOC_TYPES,
} from "../../recoil/constants";

const LabelTagsCell = React.memo(({ modal }: { modal: boolean }) => {
  const [expanded, setExpanded] = useState(true);
  const tags = useRecoilValue(
    aggregationAtoms.values({ extended: false, modal, path: "tags" })
  );
  const title = `label tags`;

  const allTags = useRecoilValue(
    aggregationAtoms.cumulativeValues({
      extended: false,
      modal: false,
      path: "tags",
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: LABEL_DOC_TYPES,
    })
  );
  const [activeTags, setActiveTags] = useRecoilState(
    schemaAtoms.activeLabelTags(modal)
  );
  const [matchedTags, setMatchedTags] = useRecoilState(
    filterAtoms.matchedTags({ modal, key: "label" })
  );
  useLayoutEffect(() => {
    const newMatches = new Set<string>();
    matchedTags.forEach((tag) => {
      tags.includes(tag) && newMatches.add(tag);
    });

    newMatches.size !== matchedTags.size && setMatchedTags(newMatches);
  }, [matchedTags, allTags]);

  const pills = usePills(
    [
      {
        icon: Check,
        title: "Clear displayed",
        onClick: () => setActiveTags([]),
        active: activeTags,
      },
      {
        icon: Visibility,
        title: "Clear matched",
        active: [...matchedTags],
        onClick: () => setMatchedTags(new Set()),
      },
    ].filter(({ active }) => active.length > 0)
  );

  return (
    <>
      <FieldHeader
        title={title}
        onClick={() => setExpanded(!expanded)}
        expanded={expanded}
      >
        <span>{title}</span>
        {...pills}
      </FieldHeader>
      {expanded &&
        tags &&
        tags.map((tag) => (
          <PathEntry
            path={`_label_tags.${tag}`}
            modal={modal}
            name={tag}
            disabled={false}
          >
            <MatchEye
              matched={matchedTags}
              elementsName={"samples"}
              name={tag}
              onClick={() => {
                const newMatch = new Set(matchedTags);
                if (matchedTags.has(tag)) {
                  newMatch.delete(tag);
                } else {
                  newMatch.add(tag);
                }
                setMatchedTags(newMatch);
              }}
            />
          </PathEntry>
        ))}
    </>
  );
});

export default LabelTagsCell;
