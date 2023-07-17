import { colorSchemeFragment$data, subscribe } from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import { useCallback } from "react";
import { DefaultValue, RecoilState, atom, selector } from "recoil";
import { State } from "./recoil";

export interface Session {
  canEditCustomColors: boolean;
  canEditSavedViews: boolean;
  readOnly: boolean;
  selectedSamples: Set<string>;
  selectedLabels: State.SelectedLabel[];
  sessionSpaces: SpaceNodeJSON;
  selectedFields?: State.Stage;
  colorScheme: Omit<colorSchemeFragment$data, " $fragmentType">;
}

type Setter = <K extends keyof Session>(key: K, value: Session[K]) => void;

type SessionAtomOptions<K extends keyof Session> = {
  key: K;
  default?: Session[K];
};

let sessionRef: Session;
let setterRef: Setter;

type Setters<
  K extends keyof Session = keyof Omit<
    Session,
    "canEditCustomColors" | "canEditSavedViews" | "readOnly"
  >
> = Partial<{
  [key in K]: (value: Session[K]) => void;
}>;
const setters: Setters = {};

export const useSession = (setter: Setter, ref: Session) => {
  setterRef = setter;
  sessionRef = ref;

  return useCallback(
    <
      K extends keyof Omit<
        Session,
        "canEditCustomColors" | "canEditSavedViews" | "readOnly"
      >
    >(
      key: K,
      value: Session[K]
    ) => {
      const setter = setters[key];
      setter && setter(value);
      sessionRef[key] = value;
    },
    []
  );
};

export function sessionAtom<K extends keyof Session>(
  options: SessionAtomOptions<K>
) {
  const value = atom<Session[K]>({
    ...options,
    effects: [
      ({ setSelf, trigger }) => {
        const assertValue = () => {
          if (
            sessionRef[options.key] === undefined &&
            options.default === undefined
          ) {
            throw new Error(`A value is required session atom ${options.key}`);
          }
        };
        if (trigger === "get") {
          assertValue();
          setSelf(
            sessionRef[options.key] === undefined
              ? options.default
              : sessionRef[options.key]
          );
        }

        // @ts-ignore
        setters[options.key] = (value: Session[K]) => {
          setSelf(value);
          sessionRef[options.key] = value;
        };

        return subscribe((_, { set }) => {
          assertValue();
          set(
            value,
            sessionRef[options.key] === undefined
              ? options.default
              : sessionRef[options.key]
          );
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
      sessionRef[options.key] = newValue;
      set(value, newValue);
    },
  }) as RecoilState<NonNullable<Session[K]>>;
}
