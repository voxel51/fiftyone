import React, { useState } from "react";
import { atom, selector, useRecoilCallback, useRecoilValue } from "recoil";
import { useSpring } from "@react-spring/web";

import {
  CLIPS_FRAME_FIELDS,
  CLIPS_SAMPLE_FIELDS,
  EMBEDDED_DOCUMENT_FIELD,
  PATCHES_FIELDS,
} from "@fiftyone/utilities";

import * as atoms from "../../recoil/atoms";
import * as schemaAtoms from "../../recoil/schema";
import * as selectors from "../../recoil/selectors";
import * as viewAtoms from "../../recoil/view";
import socket from "../../shared/connection";
import { useTheme } from "../../utils/hooks";
import { packageMessage } from "../../utils/socket";
import {
  OBJECT_PATCHES,
  EVALUATION_PATCHES,
  CLIPS_VIEWS,
} from "../../utils/links";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import { SwitcherDiv, SwitchDiv } from "./utils";
import { State } from "../../recoil/types";

export const patching = atom<boolean>({
  key: "patching",
  default: false,
});

export const patchesFields = selector<string[]>({
  key: "patchesFields",
  get: ({ get }) => {
    const paths = get(schemaAtoms.labelFields({}));
    return paths.filter((p) =>
      get(
        schemaAtoms.meetsType({
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
        schemaAtoms.fieldPaths({
          space: State.SPACE.FRAME,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: CLIPS_FRAME_FIELDS,
        })
      ),
      ...get(
        schemaAtoms.fieldPaths({
          space: State.SPACE.SAMPLE,
          ftype: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: CLIPS_SAMPLE_FIELDS,
        })
      ),
    ].sort(),
});

const evaluationKeys = selector<string[]>({
  key: "evaluationKeys",
  get: ({ get }) => {
    return Object.keys(get(atoms.stateDescription).dataset.evaluations || {});
  },
});

const useToPatches = () => {
  return useRecoilCallback(
    ({ set }) => async (field) => {
      set(patching, true);
      socket.send(
        packageMessage("save_filters", {
          add_stages: [
            {
              _cls: "fiftyone.core.stages.ToPatches",
              kwargs: [
                ["field", field],
                ["_state", null],
              ],
            },
          ],
          with_selected: true,
        })
      );
    },
    []
  );
};

const useToClips = () => {
  return useRecoilCallback(
    ({ set }) => async (field) => {
      set(patching, true);
      socket.send(
        packageMessage("save_filters", {
          add_stages: [
            {
              _cls: "fiftyone.core.stages.ToClips",
              kwargs: [
                ["field_or_expr", field],
                ["_state", null],
              ],
            },
          ],
          with_selected: true,
        })
      );
    },
    []
  );
};

const useToEvaluationPatches = () => {
  return useRecoilCallback(
    ({ set }) => async (evaluation) => {
      set(patching, true);
      socket.send(
        packageMessage("save_filters", {
          add_stages: [
            {
              _cls: "fiftyone.core.stages.ToEvaluationPatches",
              kwargs: [
                ["eval_key", evaluation],
                ["_state", null],
              ],
            },
          ],
          with_selected: true,
        })
      );
    },
    []
  );
};

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
};

const Patcher = ({ bounds, close }: PatcherProps) => {
  const theme = useTheme();
  const isVideo =
    useRecoilValue(selectors.isVideoDataset) &&
    useRecoilValue(viewAtoms.isRootView);
  const isClips = useRecoilValue(viewAtoms.isClipsView);
  const [labels, setLabels] = useState(true);

  const labelProps = useSpring({
    borderBottomColor: labels ? theme.brand : theme.backgroundDark,
    cursor: labels ? "default" : "pointer",
  });
  const evaluationProps = useSpring({
    borderBottomColor: labels ? theme.backgroundDark : theme.brand,
    cursor: labels ? "pointer" : "default",
  });
  return (
    <Popout modal={false} bounds={bounds}>
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
