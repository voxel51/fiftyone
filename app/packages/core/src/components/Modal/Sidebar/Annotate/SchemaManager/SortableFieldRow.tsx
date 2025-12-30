import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WritableAtom } from "jotai";
import React from "react";
import FieldRow from "./FieldRow";

type SelectedAtom = WritableAtom<boolean, [toggle: boolean], void>;

interface SortableFieldRowProps {
  id: string;
  path: string;
  isSelected?: SelectedAtom;
  hasSchema?: boolean;
  isReadOnly?: boolean;
}

const SortableFieldRow = ({
  id,
  path,
  isSelected,
  hasSchema = false,
  isReadOnly = false,
}: SortableFieldRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <FieldRow
        path={path}
        isSelected={isSelected}
        showDragHandle={true}
        hasSchema={hasSchema}
        isReadOnly={isReadOnly}
        dragHandleListeners={listeners}
      />
    </div>
  );
};

export default SortableFieldRow;
