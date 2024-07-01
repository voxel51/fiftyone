import type { Queries } from "./makeRoutes";
import type { Entry } from "./routing";

import { Loading, Pending } from "@fiftyone/components";
import { subscribe } from "@fiftyone/relay";
import {
  isModalActive,
  theme,
  themeConfig,
  useSetModalState,
} from "@fiftyone/state";
import { useColorScheme } from "@mui/material";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  atom,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { useRouterContext } from "./routing";

export const pendingEntry = atom<boolean>({
  key: "pendingEntry",
  default: false,
});

export const entry = atom<Entry<Queries> | null>({
  key: "Entry",
  default: null,
  dangerouslyAllowMutability: true,
});

const ColorScheme = () => {
  const { setMode } = useColorScheme();
  const current = useRecoilValue(themeConfig);
  const setTheme = useSetRecoilState(theme);
  useLayoutEffect(() => {
    if (current !== "browser") {
      setTheme(current);
      setMode(current);
    }
  }, [current, setMode, setTheme]);

  return null;
};

const Renderer = () => {
  const routeEntry = useRecoilValue(entry);

  const [pending, setPending] = useRecoilState(pendingEntry);
  const router = useRouterContext();
  const [ready, setReady] = useState(false);
  const setModalState = useSetModalState();

  const apply = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (result: Entry<Queries>) => {
        set(entry, result);
        setReady(true);
      },
    [router]
  );

  const init = useCallback(
    (result: Entry<Queries>) => {
      setModalState({}).then(() => apply(result));
    },
    [apply, setModalState]
  );

  useEffect(() => {
    router.load().then(init);
    subscribe((_, { set }) => {
      set(entry, router.get(true));
      set(pendingEntry, false);
    });
  }, [init, router]);

  useEffect(() => {
    return router.subscribe(
      () => undefined,
      () => setPending(true)
    );
  }, [router, setPending]);

  const loading = <Loading>Pixelating...</Loading>;

  if (!routeEntry || !ready) return loading;

  return (
    <Suspense fallback={loading}>
      <ColorScheme key={"color-scheme"} />
      <Modal key={"modal"} />
      <Route key={"route"} route={routeEntry} />
      {pending && <Pending key={"pending"} />}
    </Suspense>
  );
};

const Modal = () => {
  const active = Boolean(useRecoilValue(isModalActive));
  useEffect(() => {
    document.getElementById("modal")?.classList.toggle("modalon", active);
  }, [active]);

  return null;
};
const Route = ({ route }: { route: Entry<Queries> }) => {
  const Component = route.component;

  useEffect(() => {
    route &&
      document.dispatchEvent(new CustomEvent("page-change", { bubbles: true }));
  }, [route]);

  return <Component prepared={route.preloadedQuery} />;
};

export default Renderer;
