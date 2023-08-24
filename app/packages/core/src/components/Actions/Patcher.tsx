import {
  useToClips,
  useToEvaluationPatches,
  useToPatches,
} from "@fiftyone/state";
import {
  CLIPS_FRAME_FIELDS,
  CLIPS_SAMPLE_FIELDS,
  EMBEDDED_DOCUMENT_FIELD,
  PATCHES_FIELDS,
} from "@fiftyone/utilities";
import { useSpring } from "@react-spring/web";
import React, { MutableRefObject, RefObject, useState } from "react";
import { selector, useRecoilValue } from "recoil";
import {
  CLIPS_VIEWS,
  EVALUATION_PATCHES,
  OBJECT_PATCHES,
} from "../../utils/links";

import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { ActionOption } from "./Common";
import Popout from "./Popout";
import { SwitchDiv, SwitcherDiv } from "./utils";

export const patchesFields = selector<string[]>({
  key: "patchesFields",
  get: ({ get }) => {
    const paths = get(fos.labelFields({}));
    return paths.filter((p) =>
      get(
        fos.meetsType({
          path: p,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: PATCHES_FIELDS,
        })
      )
    );
  },
});

export const clipsFields = selector<string[]>({
  key: "clipsFields",
  get: ({ get }) =>
    [
      ...get(
        fos.fieldPaths({
          space: fos.State.SPACE.FRAME,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: CLIPS_FRAME_FIELDS,
        })
      ),
      ...get(
        fos.fieldPaths({
          space: fos.State.SPACE.SAMPLE,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: CLIPS_SAMPLE_FIELDS,
        })
      ),
    ].sort(),
});

const evaluationKeys = selector<string[]>({
  key: "evaluationKeys",
  get: ({ get }) => {
    const paths = get(fos.labelFields({}));
    const valid = paths.filter((p) =>
      get(
        fos.meetsType({
          path: p,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: PATCHES_FIELDS,
        })
      )
    );

    const evals = get(fos.dataset).evaluations.filter(
      (e) =>
        valid.includes(e.config.predField) || valid.includes(e.config.gtField)
    );

    const keys = evals.map(({ key }) => key);

    return keys;
  },
});

const LabelsClips = ({ close }) => {
  const fields = useRecoilValue(clipsFields);
  const toClips = useToClips();

  return (
    <>
      {fields.map((field) => {
        return (
          <ActionOption
            key={field}
            text={field}
            title={`Switch to clips view for the "${field}" field`}
            onClick={() => {
              close();
              toClips(field);
            }}
          />
        );
      })}
      <ActionOption
        key={0}
        text={"About clips views"}
        title={"About clips views"}
        href={CLIPS_VIEWS}
      />
    </>
  );
};

const LabelsPatches = ({ close }) => {
  const fields = useRecoilValue(patchesFields);
  const toPatches = useToPatches();

  return (
    <>
      {fields.map((field) => {
        return (
          <ActionOption
            id="labels-patches"
            key={field}
            text={field}
            title={`Switch to patches view for the "${field}" field`}
            onClick={() => {
              close();
              toPatches(field);
            }}
          />
        );
      })}
      <ActionOption
        key={0}
        text={"About patch views"}
        title={"About patch views"}
        href={OBJECT_PATCHES}
      />
    </>
  );
};

const EvaluationPatches = ({ close }) => {
  const evaluations = useRecoilValue(evaluationKeys);
  const toEvaluationPatches = useToEvaluationPatches();

  return (
    <>
      {evaluations.map((evaluation) => {
        return (
          <ActionOption
            key={evaluation}
            text={evaluation}
            title={`Switch to evaluation patches view for the "${evaluation}" evaluation`}
            onClick={() => {
              close();
              toEvaluationPatches(evaluation);
            }}
          />
        );
      })}
      <ActionOption
        key={0}
        text={"About evaluation views"}
        title={"About evaluation views"}
        href={EVALUATION_PATCHES}
      />
    </>
  );
};

type PatcherProps = {
  close: () => void;
  anchorRef?: MutableRefObject<unknown>;
};

const Patcher = ({ bounds, close, anchorRef }: PatcherProps) => {
  const theme = useTheme();
  const isVideo =
    useRecoilValue(fos.isVideoDataset) && useRecoilValue(fos.isRootView);
  const isClips = useRecoilValue(fos.isClipsView);
  const [labels, setLabels] = useState(true);

  const labelProps = useSpring({
    borderBottomColor: labels
      ? theme.primary.plainColor
      : theme.background.level2,
    cursor: labels ? "default" : "pointer",
  });
  const evaluationProps = useSpring({
    borderBottomColor: labels
      ? theme.background.level2
      : theme.primary.plainColor,
    cursor: labels ? "pointer" : "default",
  });
  return (
    <Popout modal={false} bounds={bounds} fixed anchorRef={anchorRef}>
      <SwitcherDiv>
        <SwitchDiv
          style={labelProps}
          onClick={() => !labels && setLabels(true)}
        >
          Labels
        </SwitchDiv>
        {!isVideo && (
          <SwitchDiv
            style={evaluationProps}
            onClick={() => labels && setLabels(false)}
          >
            Evaluations
          </SwitchDiv>
        )}
      </SwitcherDiv>
      {labels && (isVideo || isClips) && <LabelsClips close={close} />}
      {labels && !isVideo && !isClips && <LabelsPatches close={close} />}
      {!labels && <EvaluationPatches close={close} />}
    </Popout>
  );
};

export default React.memo(Patcher);
