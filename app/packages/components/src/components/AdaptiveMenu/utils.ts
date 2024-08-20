import { throttle } from "lodash";

const ADAPT_THROTTLE = 250;

export const SHOW_MORE_ACTIONS_BUTTON_WIDTH = 48;

export const hideOverflowingNodes = throttle(
  (container: HTMLDivElement, onHide: HideOverflowingNodesCallback) => {
    if (!container) return;
    const containerWidth = container.offsetWidth;
    const itemsContainer = container.childNodes[0] as HTMLDivElement;
    const items = itemsContainer?.childNodes as NodeListOf<HTMLDivElement>;
    const availableWidth = containerWidth - SHOW_MORE_ACTIONS_BUTTON_WIDTH;
    let hiddenItems = 0;
    let lastRightEdge = 0;
    let lastVisibleItemId = "";

    items.forEach((item: HTMLDivElement) => {
      const itemWidth = item.offsetWidth;
      const itemLeft = item.offsetLeft;
      const rightEdge = itemWidth + itemLeft;
      const overflown = rightEdge > availableWidth;
      if (overflown) {
        hiddenItems++;
      } else {
        lastRightEdge = rightEdge;
        lastVisibleItemId = item.getAttribute("data-item-id") as string;
      }
    });
    itemsContainer.style.width = `${lastRightEdge - 8}px`;
    onHide(hiddenItems, lastVisibleItemId);
  },
  ADAPT_THROTTLE,
  { trailing: true }
);

type HideOverflowingNodesCallback = (
  hiddenItemsCount: number,
  lastVisibleItemId: string
) => void;
