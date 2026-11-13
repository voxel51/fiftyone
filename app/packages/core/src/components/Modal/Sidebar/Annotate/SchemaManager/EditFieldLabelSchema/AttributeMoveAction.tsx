/**
 * The field editor footer's "Move N to hidden / active" action over the
 * attribute sections' checkbox selection. Moves are draft edits to the
 * open schema's visibility (`pendingAttributeTiers`) and persist with
 * the editor's Save like any other schema edit.
 */

import { Button, Icon, IconName, Size, Variant } from "@voxel51/voodo";
import { useAtom, useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  pendingAttributeTiers,
  selectedActiveAttributes,
  selectedHiddenAttributes,
} from "../state";

const AttributeMoveAction = () => {
  const [selectedActive, setSelectedActive] = useAtom(selectedActiveAttributes);
  const [selectedHidden, setSelectedHidden] = useAtom(selectedHiddenAttributes);
  const setPending = useSetAtom(pendingAttributeTiers);

  // Selections belong to this editor session only.
  useEffect(
    () => () => {
      setSelectedActive(new Set());
      setSelectedHidden(new Set());
    },
    [setSelectedActive, setSelectedHidden],
  );

  const toHidden = selectedActive.size > 0;
  const selection = toHidden ? selectedActive : selectedHidden;
  if (!selection.size) return null;

  const move = () => {
    setPending((current) => {
      const next = { ...current };
      for (const name of selection) {
        next[name] = toHidden ? "hidden" : "annotate";
      }
      return next;
    });
    setSelectedActive(new Set());
    setSelectedHidden(new Set());
  };

  return (
    <Button
      data-cy="move-attributes"
      size={Size.Md}
      variant={Variant.Secondary}
      onClick={move}
    >
      <Icon
        name={toHidden ? IconName.ChevronBottom : IconName.ChevronTop}
        size={Size.Md}
        style={{ marginRight: 4 }}
      />
      Move {selection.size} to {toHidden ? "hidden" : "active"}
    </Button>
  );
};

export default AttributeMoveAction;
