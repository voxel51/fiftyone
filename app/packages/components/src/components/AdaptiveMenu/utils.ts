import { throttle } from "lodash";

const ADAPT_THROTTLE = 100;

export const SHOW_MORE_ACTIONS_BUTTON_WIDTH = 48;
export const ADAPTIVE_MENU_GAP = 8;

export const hideOverflowingNodes = throttle(
  (container: HTMLDivElement, onHide: HideOverflowingNodesCallback) => {
    if (!container) return;
    const containerWidth = container.offsetWidth;
    const itemsContainer = container.childNodes[0] as HTMLDivElement;
    const items = itemsContainer?.childNodes as NodeListOf<HTMLDivElement>;

    let availableWidth =
      containerWidth - SHOW_MORE_ACTIONS_BUTTON_WIDTH - ADAPTIVE_MENU_GAP;
    let hiddenItems = 0;
    let lastVisibleItemId = "";
    let totalVisibleWidth = 0;

    items.forEach((item: HTMLDivElement) => {
      const itemWidth = item.offsetWidth;
      const itemLeft = item.offsetLeft;
      const rightEdge = itemWidth + itemLeft;
      const overflown = rightEdge > availableWidth;
      if (overflown) {
        hiddenItems++;
      } else {
        lastVisibleItemId = item.getAttribute("data-item-id") as string;
        totalVisibleWidth += itemWidth;
      }
    });

    // If only one item would be hidden, check if we can fit it by not rendering
    // the "More Items" button
    if (hiddenItems === 1) {
      availableWidth = containerWidth;
      hiddenItems = 0;
      lastVisibleItemId = "";
      totalVisibleWidth = 0;

      items.forEach((item: HTMLDivElement) => {
        const itemWidth = item.offsetWidth;
        const itemLeft = item.offsetLeft;
        const rightEdge = itemWidth + itemLeft;
        const overflown = rightEdge > availableWidth;
        if (overflown) {
          hiddenItems++;
        } else {
          lastVisibleItemId = item.getAttribute("data-item-id") as string;
          totalVisibleWidth += itemWidth;
        }
      });
    }

    const visibleItemsCount = items.length - hiddenItems;
    const totalGap = Math.max(0, visibleItemsCount - 1) * ADAPTIVE_MENU_GAP;
    const calculatedWidth = totalVisibleWidth + totalGap;
    itemsContainer.style.width = `${calculatedWidth}px`;
    onHide(hiddenItems, lastVisibleItemId);
  },
  ADAPT_THROTTLE,
  { trailing: true }
);

type HideOverflowingNodesCallback = (
  hiddenItemsCount: number,
  lastVisibleItemId: string
) => void;
