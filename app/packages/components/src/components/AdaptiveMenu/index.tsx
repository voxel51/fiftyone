import { escapeKeyHandlerIdsAtom, useKeyDown } from "@fiftyone/state";
import { ExpandMore } from "@mui/icons-material";
import { Box, BoxProps } from "@mui/material";
import { throttle } from "lodash";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { MoveEvent, ReactSortable, SortableEvent } from "react-sortablejs";
import { useSetRecoilState } from "recoil";
import PillButton from "../PillButton";
import PopoutButton from "../PopoutButton";
import { hideOverflowingNodes, SHOW_MORE_ACTIONS_BUTTON_WIDTH } from "./utils";

export default function AdaptiveMenu(props: AdaptiveMenuPropsType) {
  const {
    id,
    items,
    onOrderChange,
    containerProps = {},
    right,
    moreItemsOrientation,
  } = props;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = React.useState(0);
  const [previewItems, setPreviewItems] = React.useState<AdaptiveMenuItems>();
  const draggingEndedRef = useRef(false);
  const lastSwapRef = useRef<Array<number>>([]);
  const pendingMoveRef = useRef<Array<number>>([]);

  const itemsById = useMemo(() => {
    return items.reduce((itemsById, item, index) => {
      itemsById[item.id] = { ...item, index };
      return itemsById;
    }, {} as Record<string, AdaptiveMenuItemPropsType>);
  }, [items]);

  const computedItems = previewItems || items;

  const hiddenItems = useMemo(() => {
    return items.slice(items.length - hidden);
  }, [items, hidden]);

  const handleOrderChange = (updatedItems: AdaptiveMenuItems) => {
    onOrderChange?.(updatedItems);
  };

  function autoFitNodes() {
    const containerElem = containerRef.current;
    if (!containerElem) return;
    hideOverflowingNodes(containerElem, (_: number, lastVisibleItemId) => {
      const lastVisibleItem = itemsById[lastVisibleItemId];
      const computedHidden = items.length - lastVisibleItem.index - 1;
      setHidden(computedHidden);
    });
  }

  const ro = useMemo(() => {
    return new ResizeObserver(autoFitNodes);
  }, []);

  useLayoutEffect(() => {
    const containerElem = containerRef?.current;
    if (containerElem) {
      ro.observe(containerElem);
    }
  }, [ro, containerRef.current]); // eslint-disable-line

  const handleMove = useMemo(() => {
    return throttle((e: MoveEvent) => {
      if (draggingEndedRef.current) {
        return;
      }
      const draggedId = e.dragged.getAttribute("data-item-id");
      const relatedId = e.related.getAttribute("data-item-id");
      const previewItems = [...items];
      const draggedItem = itemsById[draggedId];
      const relatedItem = itemsById[relatedId];
      const draggedIndex = draggedItem.index;
      const relatedIndex = relatedItem.index;
      previewItems[draggedItem.index] = relatedItem;
      previewItems[relatedItem.index] = draggedItem;
      const lastSwap = lastSwapRef.current;
      if (lastSwap.includes(draggedIndex) && lastSwap.includes(relatedIndex)) {
        return;
      }
      setPreviewItems(previewItems);
      lastSwapRef.current = [draggedItem.index, relatedItem.index];
    }, 100);
  }, [items, itemsById]);

  function resetPreview() {
    lastSwapRef.current = [];
    setPreviewItems(undefined);
  }

  function onMove(e: MoveEvent, source: MenuVariant) {
    const draggedId = e.dragged.getAttribute("data-item-id");
    const relatedId = e.related.getAttribute("data-item-id");
    const draggedItem = itemsById[draggedId as string];
    const relatedItem = itemsById[relatedId as string];
    pendingMoveRef.current = [];
    if (relatedItem.priority !== draggedItem.priority) {
      return false;
    }
    if (e.from === e.to) {
      resetPreview();
      pendingMoveRef.current = [draggedItem.index, relatedItem.index];
      return true;
    }
    if (source === "overflow") {
      handleMove(e);
    }
    return false;
  }

  function onStart() {
    draggingEndedRef.current = false;
  }

  function onEnd(e: SortableEvent) {
    draggingEndedRef.current = true;
    if (previewItems) {
      handleOrderChange(previewItems);
    }
    if (pendingMoveRef.current.length === 2) {
      const updatedItems = [...items];
      const [from, to] = pendingMoveRef.current;
      if (from !== to && e.oldIndex !== e.newIndex) {
        if (from > to) {
          updatedItems.splice(to, 0, updatedItems[from]);
          updatedItems.splice(from + 1, 1);
        } else {
          updatedItems.splice(to + 1, 0, updatedItems[from]);
          updatedItems.splice(from, 1);
        }
        handleOrderChange(updatedItems);
      }
      pendingMoveRef.current = [];
    }
    resetPreview();
  }

  return (
    <Box
      {...containerProps}
      data-itemid={id}
      ref={containerRef}
      sx={{
        display: "flex",
        overflow: "clip",
        gap: 1,
        flexDirection: right ? "row-reverse" : "row",
        ...(containerProps.sx || {}),
      }}
    >
      <ReactSortable
        group={id}
        list={items}
        setList={() => {}}
        style={{
          display: "flex",
          gap: 8,
          maxWidth: `calc(100% - ${SHOW_MORE_ACTIONS_BUTTON_WIDTH}px)`,
          overflow: "clip",
          transition: "width 0.25s",
        }}
        animation={200}
        onMove={(e) => {
          return onMove(e, "visible");
        }}
        onStart={onStart}
        onEnd={onEnd}
      >
        <AdaptiveMenuItems
          items={computedItems}
          variant="visible"
          refresh={autoFitNodes}
        />
      </ReactSortable>
      {hidden > 0 && (
        <MoreItems
          id={id}
          items={hiddenItems}
          onMove={onMove}
          onEnd={onEnd}
          onStart={onStart}
          onOrderChange={(overflownItems) => {
            const updatedItems = [
              ...items.slice(0, hidden * -1),
              ...overflownItems,
            ];
            handleOrderChange(updatedItems);
          }}
          orientation={moreItemsOrientation}
          refresh={autoFitNodes}
        />
      )}
    </Box>
  );
}

function AdaptiveMenuItems(props: AdaptiveMenuItemsPropsType) {
  const { items, variant, closeOverflow, refresh } = props;
  return items.map((item) => {
    const { Component, id } = item;
    return (
      <Component
        key={id}
        variant={variant}
        data-item-id={id}
        closeOverflow={closeOverflow}
        refresh={refresh}
      />
    );
  });
}

function MoreItems(props: MoreItemsPropsType) {
  const { id, items, onMove, onEnd, onStart, orientation, refresh } = props;
  const [open, setOpen] = React.useState(false);
  const setEscapeHandlerIds = useSetRecoilState(escapeKeyHandlerIdsAtom);

  useEffect(() => {
    if (open) {
      setEscapeHandlerIds((state) => {
        const updated = new Set([...Array.from(state)]);
        updated.add(id);
        return updated;
      });
    } else {
      setEscapeHandlerIds((state) => {
        const updated = new Set([...Array.from(state)]);
        updated.delete(id);
        return updated;
      });
    }
  }, [open, setEscapeHandlerIds, id]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useKeyDown("Escape", close);

  return (
    <PopoutButton
      Button={
        <PillButton
          onClick={() => {
            setOpen(!open);
          }}
          icon={<ExpandMore />}
          title="More items"
          highlight
        />
      }
      open={open}
      onClose={close}
    >
      <ReactSortable
        group={id}
        list={items}
        setList={() => {}}
        animation={200}
        onMove={(e) => onMove(e, "overflow")}
        onEnd={onEnd}
        onStart={onStart}
        style={{
          display: "flex",
          gap: 4,
          flexDirection: orientation === "vertical" ? "column" : "row",
          flexWrap: "wrap",
        }}
      >
        <AdaptiveMenuItems
          items={items}
          variant="overflow"
          closeOverflow={() => {
            setOpen(false);
          }}
          refresh={refresh}
        />
      </ReactSortable>
    </PopoutButton>
  );
}

export type AdaptiveMenuItemComponentPropsType = {
  variant: "visible" | "overflow";
  closeOverflow?: () => void;
  refresh?: () => void;
};

type AdaptiveMenuItemPropsType = {
  id: string;
  index?: number;
  priority?: number;
  Component: React.FunctionComponent<AdaptiveMenuItemComponentPropsType>;
};

type AdaptiveMenuItems = AdaptiveMenuItemPropsType[];

type AdaptiveMenuPropsType = {
  id: string;
  items: AdaptiveMenuItems;
  onOrderChange?: (items: AdaptiveMenuItems) => void;
  containerProps?: BoxProps;
  right?: boolean;
  moreItemsOrientation?: MenuOrientation;
};

type MoreItemsPropsType = {
  id: string;
  items: AdaptiveMenuItems;
  onMove: (e: MoveEvent, source: MenuVariant) => boolean;
  onEnd: () => void;
  onStart: () => void;
  onOrderChange?: (items: AdaptiveMenuItems) => void;
  orientation?: MenuOrientation;
  refresh?: () => void;
};

type MenuVariant = "visible" | "overflow";
type MenuOrientation = "horizontal" | "vertical";

type AdaptiveMenuItemsPropsType = {
  items: AdaptiveMenuItems;
  variant: MenuVariant;
  closeOverflow?: () => void;
  refresh?: () => void;
};
