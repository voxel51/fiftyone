import { setView, setViewMutation } from "@fiftyone/relay";

import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import { State, stateSubscription, view, viewStateForm } from "../recoil";

import * as fos from "../";

const useSetView = (patch = false, selectSlice = false) => {
  return useSetRecoilState(view);
};

export default useSetView;
