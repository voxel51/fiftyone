/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import styles from "./Strips.module.css";

import { LoadingDots } from "@fiftyone/components";
import { type ReactNode, Suspense, useState } from "react";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { StripsContext } from "./context";
import useStrips from "./useStrips";

/** The scroller that hosts a Lanes or Matrix layout and its shared strips. */
export default function StripsRoot({ children }: { children: ReactNode }) {
  const id = useMemoOne(() => uuid(), []);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const strips = useStrips(id, root);

  return (
    <div id={id} ref={setRoot} className={styles.scroller} data-cy="fo-grid">
      <StripsContext.Provider value={strips}>
        <Suspense
          fallback={
            <div className={styles.none}>
              <LoadingDots text="Loading" />
            </div>
          }
        >
          {children}
        </Suspense>
      </StripsContext.Provider>
    </div>
  );
}
