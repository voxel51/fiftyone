import * as fos from "@fiftyone/state";
import {
  useToClips,
  useToEvaluationPatches,
  useToPatches,
} from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import {
  BoxesIcon,
  Dropdown,
  DropdownAnchor,
  LaunchIcon,
  MenuIconTextItem,
  MenuSectionTitle,
  MenuSeparator,
  MenuTextItem,
} from "@voxel51/voodo";
import {
  CLIPS_VIEWS,
  EVALUATION_PATCHES,
  OBJECT_PATCHES,
} from "@fiftyone/utilities";
import { clipsFields, evaluationKeys, patchesFields } from "./patchFields";
import ToolbarAction from "./ToolbarAction";

const About = ({ href, text }: { href: string; text: string }) => (
  <MenuIconTextItem
    icon={<LaunchIcon size={14} />}
    text={text}
    onClick={() => window.open(href, "_blank", "noopener")}
  />
);

const ClipsItems = () => {
  const fields = useReverbValue(clipsFields);
  const toClips = useToClips();

  return (
    <>
      <MenuSectionTitle>Clips</MenuSectionTitle>
      {fields.map((field) => (
        <MenuTextItem key={field} onClick={() => toClips(field)}>
          {field}
        </MenuTextItem>
      ))}
      <MenuSeparator />
      <About href={CLIPS_VIEWS} text="About clips views" />
    </>
  );
};

const PatchesItems = () => {
  const fields = useReverbValue(patchesFields);
  const evaluations = useReverbValue(evaluationKeys);
  const toPatches = useToPatches();
  const toEvaluationPatches = useToEvaluationPatches();

  return (
    <>
      <MenuSectionTitle>Labels</MenuSectionTitle>
      {fields.map((field) => (
        <MenuTextItem key={field} onClick={() => toPatches(field)}>
          {field}
        </MenuTextItem>
      ))}
      {evaluations.length > 0 && (
        <>
          <MenuSectionTitle>Evaluations</MenuSectionTitle>
          {evaluations.map((key) => (
            <MenuTextItem key={key} onClick={() => toEvaluationPatches(key)}>
              {key}
            </MenuTextItem>
          ))}
        </>
      )}
      <MenuSeparator />
      <About href={OBJECT_PATCHES} text="About patches views" />
      {evaluations.length > 0 && (
        <About href={EVALUATION_PATCHES} text="About evaluation views" />
      )}
    </>
  );
};

/** Turns the grid into patches (or clips, for video) of a label field */
const PatchesMenu = () => {
  const isRoot = useReverbValue(fos.isRootView);
  const isVideo = useReverbValue(fos.isVideoDataset);
  const patching = useReverbValue(fos.patching);
  const clips = isVideo && isRoot;

  return (
    <Dropdown
      portal
      anchor={DropdownAnchor.BottomStart}
      disabled={patching}
      trigger={
        <ToolbarAction
          data-cy="action-clips-patches"
          icon={BoxesIcon}
          label={isVideo ? "Clips" : "Patches"}
          menu
        />
      }
    >
      {clips ? <ClipsItems /> : <PatchesItems />}
    </Dropdown>
  );
};

export default PatchesMenu;
