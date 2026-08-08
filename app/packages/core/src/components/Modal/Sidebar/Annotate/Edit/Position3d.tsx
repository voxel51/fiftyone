import {
  encodeEntityId,
  GEOMETRY_SIGNAL,
  type GeometrySignal,
  useAnnotationEngine,
  useEngineSelector,
  useSceneSampleId,
  useSignalValue,
} from "@fiftyone/annotation";
import { LabeledField } from "@fiftyone/components";
import { DetectionLabel } from "@fiftyone/looker";
import {
  computeCuboidHeadingAndUpRelabel,
  type CuboidResizeFace,
  formatDegrees,
  getCuboidUpFace,
  HeadingUpVectorFields,
  isValidHeadingUpFacePair,
  quaternionToRadians,
  radiansToQuaternion,
  useCuboidOperations,
  useSetHeadingUpEditorHover,
  useSetHeadingUpPreview,
} from "@fiftyone/looker-3d";
import { useCurrentDatasetId } from "@fiftyone/state";
import { Box, Stack, TextField } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Vector3Tuple } from "three";
import {
  type Coordinates3d,
  deriveTransformState,
} from "./deriveTransformState";
import { useAnnotationContext } from "./useAnnotationContext";

export type { Coordinates3d } from "./deriveTransformState";

/**
 * Formats a number to a maximum of 2 decimal places.
 * Returns empty string for undefined or non-finite values.
 */
const formatValue = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return "";
  return value.toFixed(2);
};

const hasValidBounds = (coordinates: Coordinates3d): boolean => {
  const { x, y, z } = coordinates.position;
  const { lx, ly, lz } = coordinates.dimensions;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(z) &&
    lx !== undefined &&
    ly !== undefined &&
    lz !== undefined &&
    Number.isFinite(lx) &&
    Number.isFinite(ly) &&
    Number.isFinite(lz)
  );
};

export interface Position3dProps {
  readOnly?: boolean;
}

export default function Position3d({ readOnly = false }: Position3dProps) {
  const [transformState, setTransformState] = useState<Coordinates3d>({
    position: {},
    dimensions: {},
    rotation: {},
  });
  const { selected } = useAnnotationContext();
  const data = (selected?.data ?? null) as DetectionLabel | null;
  const field = selected?.field ?? null;
  const { updateCuboid } = useCuboidOperations();
  const labelId = data?._id ?? "";

  const engine = useAnnotationEngine();
  const sample = useSceneSampleId();
  const dataset = useCurrentDatasetId() ?? "";

  // `data` (the annotation context's selection payload) already carries the
  // same geometry fields as the engine's committed label and is available
  // the instant this component mounts — unlike `committed` below, which
  // depends on the engine subscription's first tick (keyed on `sample`,
  // which can itself still be settling on initial modal open). Without this,
  // the Up picker sat inert (unhighlighted, non-interactive: `upFace` stuck
  // on its pre-data fallback and `hasValidBounds` false) until *some*
  // unrelated write — e.g. a heading-arrow drag — finally produced a fresh
  // `committed` value and woke it up. Seeding from `data` first removes that
  // wait; `committed` below still re-syncs on every subsequent change.
  useEffect(() => {
    const seeded = deriveTransformState(data);
    if (seeded) {
      setTransformState(seeded);
    }
  }, [data]);

  // committed baseline — the cuboid's stored geometry read reactively from the
  // engine so it re-syncs on EVERY committed change (drag-end, number input,
  // undo/redo). The sidebar never reaches into looker-3d's working/transient
  // store; mid-gesture changes arrive via the GEOMETRY signal below.
  const committed = useEngineSelector(engine, (e) =>
    labelId && field && sample
      ? (e.getLabel({ sample, path: field, instanceId: labelId }) as
          | DetectionLabel
          | undefined)
      : undefined,
  );

  useEffect(() => {
    const next = deriveTransformState(committed);
    if (next) {
      setTransformState(next);
    }
  }, [committed]);

  // LIVE geometry from the engine — the 3D scene publishes mid-gesture ABSOLUTE
  // location/dimensions/quaternion; we render it directly. Render-only: the
  // committed write lands at drag-end through the controller. Keyed by the
  // scene's own sample id (where the engine store holds the cuboid).
  const key = useMemo(
    () =>
      labelId && field && sample
        ? encodeEntityId(dataset, {
            sample,
            path: field,
            instanceId: labelId,
          })
        : null,
    [dataset, sample, field, labelId],
  );

  const live = useSignalValue<GeometrySignal | null>(
    engine,
    GEOMETRY_SIGNAL,
    key,
    null,
  );

  useEffect(() => {
    if (!live || live.kind !== "3d") {
      return;
    }

    const rotation = quaternionToRadians(live.quaternion);
    setTransformState({
      position: {
        x: live.location[0],
        y: live.location[1],
        z: live.location[2],
      },
      dimensions: {
        lx: live.dimensions[0],
        ly: live.dimensions[1],
        lz: live.dimensions[2],
      },
      rotation: { rx: rotation[0], ry: rotation[1], rz: rotation[2] },
    });
  }, [live]);

  const handleUserInputChange = useCallback(
    (coordinateDelta: Partial<Coordinates3d>) => {
      if (readOnly || !data?._id) {
        return;
      }

      // synchronize internal state
      const newState = {
        position: {
          ...transformState.position,
          ...coordinateDelta.position,
        },
        dimensions: {
          ...transformState.dimensions,
          ...coordinateDelta.dimensions,
        },
        rotation: {
          ...transformState.rotation,
          ...coordinateDelta.rotation,
        },
      };
      setTransformState(newState);

      if (!hasValidBounds(newState)) {
        return;
      }

      // Update staged transforms
      const newLocation: Vector3Tuple = [
        newState.position.x ?? 0,
        newState.position.y ?? 0,
        newState.position.z ?? 0,
      ];
      const newDimensions: Vector3Tuple = [
        newState.dimensions.lx ?? 0,
        newState.dimensions.ly ?? 0,
        newState.dimensions.lz ?? 0,
      ];
      const newRotation: Vector3Tuple = [
        newState.rotation.rx ?? 0,
        newState.rotation.ry ?? 0,
        newState.rotation.rz ?? 0,
      ];

      const newQuaternion = radiansToQuaternion(newRotation);

      // an undoable working-store write; the autosave relay carries it on
      // to the engine and persistence
      void updateCuboid(data._id, {
        location: newLocation,
        dimensions: newDimensions,
        quaternion: newQuaternion,
        rotation: newRotation,
      });
    },
    [data, transformState, updateCuboid, readOnly],
  );

  // A cuboid's heading is always local +X by definition — it never has
  // anything to pick away from itself, so it isn't state at all.
  const headingFace: CuboidResizeFace = "+x";

  // "Up" isn't stored either — it's derived from the box's orientation by
  // `getCuboidUpFace`, the same helper the relabel below uses, so the
  // highlighted face and the face a click actually applies can't disagree.
  // (It has no scene up vector to pass — this DOM sidebar has no access to
  // one — so both sides fall back to world +Z identically.)
  //
  // Derived straight from `transformState` — the single source of truth also
  // used for the position/rotation fields above — rather than mirrored into
  // its own `useState`. Two writers racing to update a mirrored copy (this
  // derivation vs. the optimistic set below) was exactly the bug: whichever
  // fired last briefly won, so the highlighted face flickered between right
  // and stale-wrong as the engine's committed/live updates arrived out of
  // order with the optimistic local write.
  const { rx, ry, rz } = transformState.rotation;
  const upFace = useMemo<CuboidResizeFace>(() => {
    if (rx === undefined || ry === undefined || rz === undefined) {
      return "+z";
    }
    const quaternion = new THREE.Quaternion(
      ...radiansToQuaternion([rx, ry, rz]),
    );
    return getCuboidUpFace(quaternion, headingFace);
  }, [rx, ry, rz, headingFace]);

  const setHeadingUpPreview = useSetHeadingUpPreview();
  const setHeadingUpEditorHover = useSetHeadingUpEditorHover();

  // Clears any preview/hover left over from this section if the label
  // changes or the panel unmounts — otherwise a ghost arrow or suppressed
  // gizmo could get stuck showing for a label this panel no longer edits.
  useEffect(() => {
    return () => {
      setHeadingUpPreview(null);
      setHeadingUpEditorHover(null);
    };
  }, [labelId, setHeadingUpPreview, setHeadingUpEditorHover]);

  const handleHeadingUpChange = useCallback(
    (nextHeadingFace: CuboidResizeFace, nextUpFace: CuboidResizeFace) => {
      if (
        readOnly ||
        !data?._id ||
        !isValidHeadingUpFacePair(nextHeadingFace, nextUpFace) ||
        !hasValidBounds(transformState)
      ) {
        return;
      }

      const dimensions: Vector3Tuple = [
        transformState.dimensions.lx ?? 0,
        transformState.dimensions.ly ?? 0,
        transformState.dimensions.lz ?? 0,
      ];
      const quaternion = new THREE.Quaternion(
        ...radiansToQuaternion([
          transformState.rotation.rx ?? 0,
          transformState.rotation.ry ?? 0,
          transformState.rotation.rz ?? 0,
        ]),
      );

      const relabel = computeCuboidHeadingAndUpRelabel({
        dimensions,
        quaternion,
        headingFace: nextHeadingFace,
        upFace: nextUpFace,
      });

      if (!relabel) {
        return;
      }

      const rotation = quaternionToRadians(relabel.quaternion);

      // Optimistic write into the SAME state `upFace` is derived from, so the
      // highlight updates immediately without a second, racing writer — the
      // later committed/live confirmation carries this identical value, so it
      // just re-confirms rather than momentarily reverting it.
      setTransformState((prev) => ({
        ...prev,
        dimensions: {
          lx: relabel.dimensions[0],
          ly: relabel.dimensions[1],
          lz: relabel.dimensions[2],
        },
        rotation: { rx: rotation[0], ry: rotation[1], rz: rotation[2] },
      }));

      void updateCuboid(data._id, {
        dimensions: relabel.dimensions,
        quaternion: relabel.quaternion,
        rotation,
      });
    },
    [data, transformState, updateCuboid, readOnly],
  );

  return (
    <Box sx={{ width: "100%" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.25}
        sx={{ pl: 0, pt: 1, mb: 1 }}
      >
        <LabeledField
          label="x"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.position.x)}
              onChange={(e) => {
                handleUserInputChange({
                  position: { x: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ "data-cy": "position3d-x" }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="y"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.position.y)}
              onChange={(e) => {
                handleUserInputChange({
                  position: { y: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ "data-cy": "position3d-y" }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="z"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.position.z)}
              onChange={(e) => {
                handleUserInputChange({
                  position: { z: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ "data-cy": "position3d-z" }}
              disabled={readOnly}
            />
          }
        />
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.25}
        sx={{ pl: 0, pt: 1, mb: 1 }}
      >
        <LabeledField
          label="lx"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.dimensions.lx)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { lx: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1, "data-cy": "position3d-lx" }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="ly"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.dimensions.ly)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { ly: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1, "data-cy": "position3d-ly" }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="lz"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.dimensions.lz)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { lz: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1, "data-cy": "position3d-lz" }}
              disabled={readOnly}
            />
          }
        />
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.25}
        sx={{ pl: 0, pt: 1, mb: 1 }}
      >
        <LabeledField
          label={`rx (${formatDegrees(transformState.rotation.rx)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.rotation.rx)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rx: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01, "data-cy": "position3d-rx" }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label={`ry (${formatDegrees(transformState.rotation.ry)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.rotation.ry)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { ry: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01, "data-cy": "position3d-ry" }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label={`rz (${formatDegrees(transformState.rotation.rz)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.rotation.rz)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rz: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01, "data-cy": "position3d-rz" }}
              disabled={readOnly}
            />
          }
        />
      </Stack>

      <Stack spacing={0.75} sx={{ pt: 1.5 }}>
        <HeadingUpVectorFields
          upFace={upFace}
          onUpChange={(face) => handleHeadingUpChange(headingFace, face)}
          onUpFaceHover={(face) =>
            setHeadingUpPreview(
              face && labelId ? { labelId, role: "up", face } : null,
            )
          }
          onHoverActiveChange={(active) =>
            setHeadingUpEditorHover(active && labelId ? { labelId } : null)
          }
          disabled={readOnly}
        />
      </Stack>
    </Box>
  );
}
