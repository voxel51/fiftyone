import { dataset } from "@fiftyone/state";
import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import type { Group, Quaternion, Vector3 } from "three";
import type { MirisStreamAsset } from "../render-types";

// Cached promise for the Miris WASM runtime. Resolves once per page, shared
// across all MirisStream nodes. Dynamic-imported so the SDK (and its WASM
// blob) only ships if a fo3d scene actually contains a Miris stream.
let _mirisPromise: Promise<unknown> | null = null;
const ensureMirisRuntime = () => {
  if (!_mirisPromise) {
    _mirisPromise = import("@miris-inc/three").catch((err) => {
      _mirisPromise = null;
      throw err;
    });
  }
  return _mirisPromise as Promise<{ MirisStream: unknown }>;
};

export const MirisStream = ({
  name,
  asset,
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  asset: MirisStreamAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}) => {
  const ds = useRecoilValue(dataset as never) as {
    info?: Record<string, unknown>;
  } | null;
  const rawDatasetViewerKey = ds?.info?.["miris_viewer_key"];
  const datasetViewerKey =
    typeof rawDatasetViewerKey === "string" ? rawDatasetViewerKey : undefined;
  const viewerKey = asset.viewerKey ?? datasetViewerKey;

  const [stream, setStream] = useState<Group | null>(null);

  useEffect(() => {
    let constructed: Group | null = null;
    let cancelled = false;

    if (asset.assetUuid && viewerKey) {
      (async () => {
        try {
          const { MirisStream: MirisStreamSDK } = await ensureMirisRuntime() as any;
          if (cancelled) return;
          constructed = new MirisStreamSDK({
            uuid: asset.assetUuid,
            viewerKey,
          }) as unknown as Group;
          constructed.name = name;
          setStream(constructed);
        } catch (err) {
          console.error("[MirisStream] Failed to construct stream:", err);
        }
      })();
    } else if (asset.assetUuid && !viewerKey) {
      console.warn(
        "[MirisStream] No viewer key resolved (checked asset.viewerKey and " +
          "dataset.info.miris_viewer_key); skipping stream construction."
      );
    }

    return () => {
      cancelled = true;
      constructed?.removeFromParent();
      setStream(null);
    };
  }, [asset.assetUuid, viewerKey, name]);

  if (!stream) {
    return null;
  }

  return (
    <primitive
      object={stream}
      position={position}
      quaternion={quaternion}
      scale={scale}
      dispose={null}
    >
      {children ?? null}
    </primitive>
  );
};
