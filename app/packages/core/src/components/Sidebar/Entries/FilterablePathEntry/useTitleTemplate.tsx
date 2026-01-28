import { PillButton } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { VisibilityOff } from "@mui/icons-material";
import React, { Suspense, useState } from "react";
import {
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { NameAndCountContainer } from "../../../utils";
import { PathEntryCounts } from "../EntryCounts";
import Icon from "./Icon";
import { Clickable, Icon as VoodoIcon, IconName, Size } from "@voxel51/voodo";
import { Stack } from "@mui/material";
import { useAnnotationController } from "@fiftyone/annotation";

const PATH_OVERRIDES = {
  tags: "sample tags",
  _label_tags: "label tags",
};

const hiddenPathLabels = selectorFamily<string[], string>({
  key: "hiddenPathLabels",
  get:
    (path) =>
    ({ get }) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modalSampleId);

      if (data[sampleId]) {
        return data[sampleId][path] || [];
      }

      return [];
    },
  set:
    (path) =>
    ({ set, get }, value) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modalSampleId);

      set(fos.pathHiddenLabelsMap, {
        ...data,
        [sampleId]: {
          ...data[sampleId],
          [path]: value instanceof DefaultValue ? [] : value,
        },
      });
    },
});

const Hidden = ({ path }: { path: string }) => {
  const [hidden, set] = useRecoilState(hiddenPathLabels(path));
  const num = hidden.length;
  const text = num.toLocaleString();

  return num ? (
    <PillButton
      title={text}
      text={text}
      icon={<VisibilityOff />}
      onClick={() => set([])}
      open={false}
      highlight={false}
      style={{
        height: "1.5rem",
        lineHeight: "1rem",
        padding: "0.25rem 0.5rem",
        margin: "0 0.5rem",
      }}
    />
  ) : null;
};

const useTitleTemplate = ({
  modal,
  path,
  canAnnotate,
}: {
  modal: boolean;
  path: string;
  canAnnotate?: boolean;
}) => {
  return function useTitleTemplate({ hoverHandlers, hoverTarget, container }) {
    const enabled = !useRecoilValue(fos.isDisabledCheckboxPath(path));
    const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
    const expandedPath = useRecoilValue(fos.expandPath(path));
    const { enterAnnotationMode } = useAnnotationController();
    const [hovering, setHovering] = useState(false);

    return (
      <NameAndCountContainer
        ref={container}
        data-cy={`sidebar-field-container-${path}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <span key="path" data-cy={`sidebar-field-${path}`}>
          <span ref={hoverTarget} {...hoverHandlers}>
            <Stack
              sx={{ display: "inline-flex" }}
              direction="row"
              alignItems="center"
              gap={2}
            >
              {PATH_OVERRIDES[path] || path}
              {hovering && canAnnotate && modal && (
                <Clickable onClick={() => enterAnnotationMode(path)}>
                  <VoodoIcon name={IconName.Edit} size={Size.Sm} />
                </Clickable>
              )}
            </Stack>
          </span>
        </span>
        {modal && (
          <Suspense>
            <Hidden path={path} />
          </Suspense>
        )}
        {enabled && isFilterMode && (
          <PathEntryCounts key="count" modal={modal} path={expandedPath} />
        )}
        {enabled && <Icon modal={modal} path={path} />}
      </NameAndCountContainer>
    );
  };
};

export default useTitleTemplate;
