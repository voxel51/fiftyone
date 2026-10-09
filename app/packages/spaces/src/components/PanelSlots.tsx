import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import SpaceNode from "../SpaceNode";
import Panel from "./Panel";

type Scroll = [Element, number, number];

interface Host {
  element: HTMLDivElement;
  scrolls: Scroll[];
}

interface Hosts {
  attach: (id: string, slot: HTMLElement) => void;
  detach: (id: string, slot: HTMLElement) => void;
  host: (id: string) => Host;
  retain: (ids: Set<string>) => void;
}

const HostsContext = createContext<Hosts | null>(null);

/** The panels a space tree shows: each container's active tab. */
export const displayedPanels = (node: SpaceNode): SpaceNode[] => {
  if (node.layout) return node.children.flatMap(displayedPanels);
  if (node.isPanelContainer() && node.hasChildren()) {
    const active = node.getActiveChild();
    return active ? [active] : [];
  }
  return node.isPanel() ? [node] : [];
};

// a detached element loses its scroll offsets
const scrolled = (root: Element): Scroll[] =>
  Array.from(root.querySelectorAll("*"))
    .filter((el) => el.scrollTop || el.scrollLeft)
    .map((el) => [el, el.scrollTop, el.scrollLeft]);

const createHosts = (): Hosts => {
  const hosts = new Map<string, Host>();
  const host = (id: string) => {
    let entry = hosts.get(id);
    if (!entry) {
      const element = document.createElement("div");
      element.style.display = "contents";
      entry = { element, scrolls: [] };
      hosts.set(id, entry);
    }
    return entry;
  };

  return {
    attach: (id, slot) => {
      const entry = host(id);
      slot.appendChild(entry.element);
      for (const [el, top, left] of entry.scrolls) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
      entry.scrolls = [];
    },
    detach: (id, slot) => {
      const entry = hosts.get(id);
      if (entry?.element.parentNode !== slot) return;
      entry.scrolls = scrolled(entry.element);
      slot.removeChild(entry.element);
    },
    host,
    retain: (ids) => {
      for (const id of hosts.keys()) ids.has(id) || hosts.delete(id);
    },
  };
};

/**
 * Renders a space's panels from one stable place and portals each into a
 * persistent element that its `PanelSlot` holds. Splits, joins and tab moves
 * rebuild the tree around the slots; the panels themselves stay mounted.
 */
export default function PanelSlots({
  children,
  isModalPanel,
  root,
  spaceId,
}: React.PropsWithChildren<{
  isModalPanel: boolean;
  root: SpaceNode;
  spaceId: string;
}>) {
  const [hosts] = useState(createHosts);
  const panels = displayedPanels(root);
  const ids = panels.map(({ id }) => id).join(",");

  useEffect(() => hosts.retain(new Set(ids.split(","))), [hosts, ids]);

  return (
    <HostsContext.Provider value={hosts}>
      {children}
      {panels.map((node) =>
        createPortal(
          <Panel node={node} spaceId={spaceId} isModalPanel={isModalPanel} />,
          hosts.host(node.id).element,
          node.id,
        ),
      )}
    </HostsContext.Provider>
  );
}

/** Where the tree shows a panel; the panel itself renders in `PanelSlots`. */
export function PanelSlot({ id }: { id: string }) {
  const hosts = useContext(HostsContext);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = ref.current;
    if (!hosts || !slot) {
      throw new Error("PanelSlot must render within PanelSlots");
    }
    hosts.attach(id, slot);
    return () => hosts.detach(id, slot);
  }, [hosts, id]);

  return <div ref={ref} style={{ display: "contents" }} />;
}
