import React, { useLayoutEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Check, Visibility } from "@material-ui/icons";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import * as viewAtoms from "../../recoil/view";

import { MatchEye, usePills } from "./utils";
import { PathEntry, TextEntry } from "./Entries";
import { GroupHeader } from "./Sidebar";

const SampleTagsCell = React.memo(({ modal }: { modal: boolean }) => {
  const [expanded, setExpanded] = useState(true);
  const { singular } = useRecoilValue(viewAtoms.elementNames);
  const tags = useRecoilValue(
    aggregationAtoms.values({ extended: false, modal, path: "tags" })
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
      <GroupHeader
        title={title}
        onClick={() => setExpanded(!expanded)}
        expanded={expanded}
        style={{ marginBottom: 4 }}
      >
        <span>{title}</span>
        {...pills}
      </GroupHeader>
      {expanded &&
        tags &&
        (tags.length ? (
          tags.map((tag) => (
            <PathEntry
              path={`tags.${tag}`}
              modal={modal}
              name={tag}
              disabled={false}
              key={tag}
              style={{ marginBottom: 4 }}
              pills={
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
              }
            />
          ))
        ) : (
          <TextEntry text={`No ${singular} tags`} />
        ))}
    </>
  );
});

export default SampleTagsCell;
