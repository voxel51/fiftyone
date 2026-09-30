import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SubsetPages, SubsetPagesContext } from "./subsetPages";
import styles from "./SelectionTray.module.css";

const TrayOutlet = createContext<HTMLElement | null | undefined>(undefined);

/** Keeps the tray below the entire samples workspace, including side panels. */
export function SelectionTrayHost({ children }: { children: ReactNode }) {
  const [pages] = useState(() => new SubsetPages());
  const [outlet, setOutlet] = useState<HTMLDivElement | null>(null);
  return (
    <SubsetPagesContext.Provider value={pages}>
      <TrayOutlet.Provider value={outlet}>
        <div className={styles.workspace} data-selection-workspace>
          {children}
          <div ref={setOutlet} />
        </div>
      </TrayOutlet.Provider>
    </SubsetPagesContext.Provider>
  );
}

/** Retains the grid's React context while moving its tray into the footer. */
export function SelectionTrayPortal({ children }: { children: ReactNode }) {
  const outlet = useContext(TrayOutlet);
  return outlet === undefined ? (
    <>{children}</>
  ) : outlet ? (
    createPortal(children, outlet)
  ) : null;
}
