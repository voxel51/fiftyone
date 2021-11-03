import React, { useLayoutEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Check, Visibility } from "@material-ui/icons";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import * as schemaAtoms from "../../recoil/schema";
import { State } from "../../recoil/types";
import * as viewAtoms from "../../recoil/view";

import { FieldHeader, usePills } from "./utils";
import { PathEntry, TextEntry } from "./Entries";

const SampleLabelsCell = React.memo(({ modal }: { modal: boolean }) => {
  const [expanded, setExpanded] = useState(true);
  const { singular } = useRecoilValue(viewAtoms.elementNames);
  const paths = useRecoilValue(
    schemaAtoms.labelFields({ space: State.SPACE.SAMPLE })
  );
  const title = `${singular} labels`;
  const [activeTags, setActiveTags] = useRecoilState(
    schemaAtoms.activeTags(modal)
  );

  const pills = usePills(
    [
      {
        icon: Check,
        title: "Clear displayed",
        onClick: () => setActiveTags([]),
        active: activeTags,
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
        paths &&
        (paths.length ? (
          paths.map((path) => (
            <PathEntry
              path={path}
              modal={modal}
              disabled={false}
              key={path}
            ></PathEntry>
          ))
        ) : (
          <TextEntry text={`No ${singular} labels`} />
        ))}
    </>
  );
});

export default SampleLabelsCell;
