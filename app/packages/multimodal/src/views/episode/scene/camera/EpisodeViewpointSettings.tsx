import {
  FormField,
  Orientation,
  RadioGroup,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useMemo } from "react";
import {
  cameraOrbitFromPose,
  cameraPoseFromOrbit,
  normalizeEpisode3dCameraProjection,
} from "./episode-3d-viewpoint";
import { useEpisode3dViewpoint } from "./episode-3d-viewpoint-context";
import type { Episode3dCameraNavigationMode } from "./episode-3d-view-state";
import EpisodeSidebarGroup from "../../settings/controls/EpisodeSidebarGroup";
import { EpisodeSettingsLabel } from "../../settings/controls/EpisodeSettingsLabel";
import { EpisodeSettingsNumberField } from "../../settings/controls/EpisodeSettingsNumberField";
import styles from "./EpisodeViewpointSettings.module.css";

const CAMERA_AXES = ["X", "Y", "Z"] as const;
const CAMERA_NAVIGATION_OPTIONS: {
  label: string;
  value: Episode3dCameraNavigationMode;
}[] = [
  { label: "Relative to target", value: "relative" },
  { label: "Absolute coordinates", value: "absolute" },
];
const CAMERA_NAVIGATION_TOOLTIP =
  "How the camera carries over when navigating to another sample. Relative preserves azimuth, elevation, and distance around each sample's camera target; position and target translate into the new recording. Absolute preserves the exact position and target coordinates; use it only when samples share the same world coordinate system.";

/** Compact live camera controls for one 3D view's settings. */
const EpisodeViewpointSettings: React.FC<{
  readonly tileId: string | null;
}> = ({ tileId }) => {
  const viewpoint = useEpisode3dViewpoint(tileId);
  const pose = viewpoint?.snapshot.pose ?? null;
  const orbit = useMemo(
    () =>
      pose && viewpoint
        ? cameraOrbitFromPose(pose, viewpoint.snapshot.sceneUpAxis)
        : null,
    [pose, viewpoint],
  );
  const summary = orbit
    ? `Az ${formatAngle(orbit.azimuthDegrees)} · El ${formatAngle(
        orbit.elevationDegrees,
      )} · ${formatDistance(orbit.distance)} m`
    : "Waiting for camera";

  return (
    <EpisodeSidebarGroup
      defaultExpanded={false}
      summary={summary}
      title="Viewpoint"
    >
      {!viewpoint || !orbit || !pose ? (
        <Text color={TextColor.Muted} variant={TextVariant.Xs}>
          The camera will appear after the first 3D frame renders.
        </Text>
      ) : (
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <FormField
            label={
              <EpisodeSettingsLabel
                label="Across samples"
                tooltip={CAMERA_NAVIGATION_TOOLTIP}
              />
            }
            spacing={Spacing.Xs}
            control={
              <RadioGroup
                name="episode-camera-navigation-mode"
                onChange={(value) =>
                  viewpoint.controller.setCameraNavigationMode(
                    value as Episode3dCameraNavigationMode,
                  )
                }
                options={CAMERA_NAVIGATION_OPTIONS}
                size={Size.Sm}
                value={viewpoint.snapshot.cameraNavigationMode}
              />
            }
          />

          <CompactFieldRow label="Position (scene units)">
            {CAMERA_AXES.map((axis, index) => (
              <CompactNumberField
                key={axis}
                ariaLabel={`Position ${axis}`}
                label={axis}
                onCommit={(value) => {
                  const position = [...pose.position] as [
                    number,
                    number,
                    number,
                  ];
                  position[index] = value;
                  viewpoint.controller.setPose({
                    position,
                    target: pose.target,
                  });
                }}
                step={0.1}
                value={pose.position[index]}
              />
            ))}
          </CompactFieldRow>

          <CompactFieldRow label="Target (scene units)">
            {CAMERA_AXES.map((axis, index) => (
              <CompactNumberField
                key={axis}
                ariaLabel={`Target ${axis}`}
                label={axis}
                onCommit={(value) => {
                  const target = [...orbit.target] as [number, number, number];
                  target[index] = value;
                  viewpoint.controller.setPose(
                    cameraPoseFromOrbit(
                      { ...orbit, target },
                      viewpoint.snapshot.sceneUpAxis,
                    ),
                  );
                }}
                step={0.1}
                value={orbit.target[index]}
              />
            ))}
          </CompactFieldRow>

          <CompactFieldRow label="Orbit">
            <CompactNumberField
              label="Azimuth (°)"
              onCommit={(azimuthDegrees) =>
                viewpoint.controller.setPose(
                  cameraPoseFromOrbit(
                    { ...orbit, azimuthDegrees },
                    viewpoint.snapshot.sceneUpAxis,
                  ),
                )
              }
              step={1}
              value={orbit.azimuthDegrees}
            />
            <CompactNumberField
              label="Elevation (°)"
              onCommit={(elevationDegrees) =>
                viewpoint.controller.setPose(
                  cameraPoseFromOrbit(
                    { ...orbit, elevationDegrees },
                    viewpoint.snapshot.sceneUpAxis,
                  ),
                )
              }
              step={1}
              value={orbit.elevationDegrees}
            />
            <CompactNumberField
              label="Distance"
              mapping="multiplicative"
              min={0.001}
              onCommit={(distance) =>
                viewpoint.controller.setPose(
                  cameraPoseFromOrbit(
                    { ...orbit, distance },
                    viewpoint.snapshot.sceneUpAxis,
                  ),
                )
              }
              step={0.1}
              value={orbit.distance}
            />
          </CompactFieldRow>

          <CompactFieldRow label="Projection">
            <CompactNumberField
              label="FOV (°)"
              max={150}
              min={5}
              onCommit={(fovDegrees) =>
                viewpoint.controller.setProjection(
                  normalizeEpisode3dCameraProjection({
                    ...viewpoint.snapshot.projection,
                    fovDegrees,
                  }),
                )
              }
              step={1}
              value={viewpoint.snapshot.projection.fovDegrees}
            />
            <CompactNumberField
              label="Near"
              mapping="multiplicative"
              min={0.0001}
              onCommit={(near) =>
                viewpoint.controller.setProjection(
                  normalizeEpisode3dCameraProjection({
                    ...viewpoint.snapshot.projection,
                    near,
                  }),
                )
              }
              step={0.01}
              value={viewpoint.snapshot.projection.near}
            />
            <CompactNumberField
              label="Far"
              mapping="multiplicative"
              min={0.0002}
              onCommit={(far) =>
                viewpoint.controller.setProjection(
                  normalizeEpisode3dCameraProjection({
                    ...viewpoint.snapshot.projection,
                    far,
                  }),
                )
              }
              step={1}
              value={viewpoint.snapshot.projection.far}
            />
          </CompactFieldRow>
        </Stack>
      )}
    </EpisodeSidebarGroup>
  );
};

function CompactFieldRow({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <Text color={TextColor.Muted} variant={TextVariant.Caption}>
        {label}
      </Text>
      <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
        {React.Children.map(children, (child) => (
          <div className={styles.compactField}>{child}</div>
        ))}
      </Stack>
    </Stack>
  );
}

function CompactNumberField({
  ariaLabel,
  label,
  mapping,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  readonly ariaLabel?: string;
  readonly label: string;
  readonly mapping?: "linear" | "multiplicative";
  readonly max?: number;
  readonly min?: number;
  readonly onCommit: (value: number) => void;
  readonly step: number;
  readonly value: number;
}) {
  return (
    <FormField
      label={label}
      spacing={Spacing.Xs}
      control={
        <EpisodeSettingsNumberField
          ariaLabel={ariaLabel ?? label}
          commitOn="blur"
          mapping={mapping}
          max={max}
          min={min}
          onCommit={onCommit}
          step={step}
          value={value}
        />
      }
    />
  );
}

function formatAngle(value: number): string {
  return `${Math.round(value)}°`;
}

function formatDistance(value: number): string {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
}

export default EpisodeViewpointSettings;
