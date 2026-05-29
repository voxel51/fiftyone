// Shared providers + tile-registry helper for PlaybackTiles tests.

import { IconName } from "@voxel51/voodo";
import {
  TileIdScope,
  TilingProvider,
  useTileRegistry,
  type RegisteredTile,
} from "@fiftyone/tiling";
import { Provider as JotaiProvider, createStore } from "jotai";
import React, { useEffect, useMemo } from "react";
import { PlaybackProvider } from "../lib/playback/PlaybackProvider";

const DummyTile: React.FC = () => null;

export interface TileRegistration {
  type: string;
  typeLabel?: string;
  Tile?: React.ComponentType;
}

export const RegisterTiles: React.FC<{ entries: TileRegistration[] }> = ({
  entries,
}) => {
  const { registerTile } = useTileRegistry();
  // registerTile is a stable jotai-backed setter — not in deps by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const disposes = entries.map((e) => {
      const entry: RegisteredTile = {
        type: e.type,
        typeLabel: e.typeLabel ?? e.type,
        icon: IconName.GridView,
        Tile: e.Tile ?? DummyTile,
      };
      return registerTile(entry);
    });
    return () => {
      for (const d of disposes) d();
    };
  }, [entries]);
  return null;
};

export interface TileHarnessProps {
  tileId: string;
  /** Optional tile entries to register up-front. */
  register?: TileRegistration[];
  /** Optional playback duration; default leaves it stream-driven. */
  duration?: number;
  children: React.ReactNode;
}

export const TileHarness: React.FC<TileHarnessProps> = ({
  tileId,
  register = [],
  duration,
  children,
}) => {
  // Memoize so the Jotai store survives re-renders — otherwise every
  // render would reset all atom state under the harness.
  const store = useMemo(() => createStore(), []);
  return (
    <JotaiProvider store={store}>
      <PlaybackProvider duration={duration}>
        <TilingProvider>
          {register.length > 0 && <RegisterTiles entries={register} />}
          <TileIdScope tileId={tileId}>{children}</TileIdScope>
        </TilingProvider>
      </PlaybackProvider>
    </JotaiProvider>
  );
};
