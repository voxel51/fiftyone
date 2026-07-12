import {
  FormField,
  Input,
  InputType,
  Orientation,
  RadioGroup,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  cameraOrbitFromPose,
  cameraPoseFromOrbit,
  normalizeMcap3dCameraProjection,
} from "./mcap-3d-viewpoint";
import { useMcap3dViewpoint } from "./mcap-3d-viewpoint-context";
import type { Mcap3dCameraNavigationMode } from "./mcap-3d-view-state";
import McapSidebarGroup from "./McapSidebarGroup";
import { McapSettingsLabel } from "./McapSettingsLabel";
import styles from "./McapViewpointSettings.module.css";

const CAMERA_AXES = ["X", "Y", "Z"] as const;
const CAMERA_NAVIGATION_OPTIONS: {
  label: string;
  value: Mcap3dCameraNavigationMode;
}[] = [
  { label: "Relative to target", value: "relative" },
  { label: "Absolute coordinates", value: "absolute" },
];
const CAMERA_NAVIGATION_TOOLTIP =
  "Relative preserves azimuth, elevation, and distance around each sample's camera target; position and target translate into the new recording. Absolute preserves the exact position and target coordinates; use it only when samples share the same world coordinate system.";

/** Compact live camera controls for the modal Scene sidebar. */
const McapViewpointSettings: React.FC<{
  readonly preferredTileId?: string | null;
}> = ({ preferredTileId }) => {
  const viewpoint = useMcap3dViewpoint(preferredTileId);
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
    : viewpoint
      ? "Waiting for camera"
      : "No 3D view";

  return (
    <McapSidebarGroup
      defaultExpanded={false}
      summary={summary}
      title="Viewpoint"
    >
      {!viewpoint || !orbit || !pose ? (
        <Text color={TextColor.Muted} variant={TextVariant.Xs}>
          {viewpoint
            ? "The camera will appear after the first 3D frame renders."
            : "Add a 3D panel to inspect and edit its camera."}
        </Text>
      ) : (
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <FormField
            label={
              <McapSettingsLabel
                label="Between samples"
                tooltip={CAMERA_NAVIGATION_TOOLTIP}
              />
            }
            spacing={Spacing.Xs}
            control={
              <RadioGroup
                name="mcap-camera-navigation-mode"
                onChange={(value) =>
                  viewpoint.controller.setCameraNavigationMode(
                    value as Mcap3dCameraNavigationMode,
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
                step="any"
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
                step="any"
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
              min={0.001}
              onCommit={(distance) =>
                viewpoint.controller.setPose(
                  cameraPoseFromOrbit(
                    { ...orbit, distance },
                    viewpoint.snapshot.sceneUpAxis,
                  ),
                )
              }
              step="any"
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
                  normalizeMcap3dCameraProjection({
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
              min={0.0001}
              onCommit={(near) =>
                viewpoint.controller.setProjection(
                  normalizeMcap3dCameraProjection({
                    ...viewpoint.snapshot.projection,
                    near,
                  }),
                )
              }
              step="any"
              value={viewpoint.snapshot.projection.near}
            />
            <CompactNumberField
              label="Far"
              min={0.0002}
              onCommit={(far) =>
                viewpoint.controller.setProjection(
                  normalizeMcap3dCameraProjection({
                    ...viewpoint.snapshot.projection,
                    far,
                  }),
                )
              }
              step="any"
              value={viewpoint.snapshot.projection.far}
            />
          </CompactFieldRow>
        </Stack>
      )}
    </McapSidebarGroup>
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
  max,
  min,
  onCommit,
  step,
  value,
}: {
  readonly ariaLabel?: string;
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly onCommit: (value: number) => void;
  readonly step: number | "any";
  readonly value: number;
}) {
  const [draft, setDraft] = useState(() => formatInputValue(value));
  const editingRef = useRef(false);
  const cancelledRef = useRef(false);
  // This effect follows live camera changes while preserving an active draft.
  useEffect(() => {
    if (!editingRef.current) setDraft(formatInputValue(value));
  }, [value]);

  const commit = () => {
    editingRef.current = false;
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(formatInputValue(value));
      return;
    }
    if (draft.trim() === "") {
      setDraft(formatInputValue(value));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatInputValue(value));
      return;
    }
    const bounded = Math.min(
      max ?? Number.POSITIVE_INFINITY,
      Math.max(min ?? Number.NEGATIVE_INFINITY, parsed),
    );
    setDraft(formatInputValue(bounded));
    onCommit(bounded);
  };

  return (
    <FormField
      label={label}
      spacing={Spacing.Xs}
      control={
        <Input
          aria-label={ariaLabel ?? label}
          className={styles.numberInput}
          max={max}
          min={min}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => {
            editingRef.current = true;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelledRef.current = true;
              event.currentTarget.blur();
            }
          }}
          size={Size.Xs}
          step={step}
          type={InputType.Number}
          value={draft}
        />
      }
    />
  );
}

function formatInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number(value.toPrecision(7)).toString();
}

function formatAngle(value: number): string {
  return `${Math.round(value)}°`;
}

function formatDistance(value: number): string {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
}

export default McapViewpointSettings;
