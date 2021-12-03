import React from "react";

import { RegularEntry } from "./RegularEntry";

const TagFilter = ({ tag }: { tag: string }) => {
  return;
};

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
/>;
