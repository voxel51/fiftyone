import {
  Button,
  Dropdown,
  DropdownAnchor,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, { type ReactNode } from "react";
import { DefaultAddTileMenuItems } from "../AddTileMenu/DefaultAddTileMenuItems";
import styles from "./TilingZeroState.module.css";

export interface TilingZeroStateProps {
  /**
   * Custom content for the add-tile menu (voodo Menu* primitives).
   * Pass the same node given to `TilingHeader`'s `addTileMenu` so both
   * entry points offer an identical catalog. Defaults to the registered
   * tile kinds.
   */
  addTileMenu?: ReactNode;
}

/**
 * Empty-canvas spawn point for `MosaicGrid`'s `zeroStateView`: instead
 * of a dead "No tiles open" note, the canvas centers a prominent
 * add-tile button that opens the same menu as the header's entry point.
 */
const TilingZeroState: React.FC<TilingZeroStateProps> = ({ addTileMenu }) => (
  <div className={styles.root} data-testid="tiling-zero-state">
    <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
      No tiles open
    </Text>
    <Dropdown
      anchor={DropdownAnchor.Bottom}
      trigger={
        <Button
          variant={Variant.Secondary}
          size={Size.Md}
          leadingIcon={IconName.Add}
          data-testid="tiling-zero-state-add-tile"
        >
          Add tile
        </Button>
      }
    >
      {addTileMenu ?? <DefaultAddTileMenuItems />}
    </Dropdown>
  </div>
);

export default TilingZeroState;
