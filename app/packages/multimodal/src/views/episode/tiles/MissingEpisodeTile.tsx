import React from "react";
import type { EpisodeTileProps } from "./episode-tile-types";
import styles from "./EpisodeTile.module.css";

/** Preserves a contributed tile's layout slot when its code is unavailable. */
const MissingEpisodeTile: React.FC<EpisodeTileProps> = ({
  unavailableType,
}) => (
  <div className={styles.loading} data-testid="episode-missing-tile">
    <span className={styles.emptyText}>
      {unavailableType
        ? `Tile extension “${unavailableType}” is not available in this build`
        : "This tile extension is not available in this build"}
    </span>
  </div>
);

export default MissingEpisodeTile;
