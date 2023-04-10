import { subscribe } from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import { atom, DefaultValue, selector } from "recoil";
import { State } from "./recoil";

export interface Session {
  selectedSamples: Set<string>;
  selectedLabels: State.SelectedLabel[];
  sessionSpaces: SpaceNodeJSON;
}

type Setter = <K extends keyof Session>(key: K, value: Session[K]) => void;

type SessionAtomOptions<K extends keyof Session> = {
  key: K;
  default: Session[K];
};

let sessionRef: Session;
let setterRef: Setter;

export const useSession = (session: Session, setter: Setter) => {
  sessionRef = session;
  setterRef = setter;
  return;
};

export function sessionAtom<K extends keyof Session>(
  options: SessionAtomOptions<K>
) {
  const value = atom({
    ...options,
    effects: [
      ({ setSelf, trigger }) => {
        if (trigger === "get") {
          setSelf(sessionRef[options.key]);
        }

        return subscribe((_, { set }) => {
          set(value, sessionRef[options.key]);
        });
      },
    ],
  });

  return selector<Session[K]>({
    key: `__${options.key}_SELECTOR`,
    get: ({ get }) => get(value),
    set: ({ set }, newValue) => {
      if (newValue instanceof DefaultValue) {
        newValue = options.default;
      }

      setterRef(options.key, newValue);
      set(value, newValue);
    },
  });
}
