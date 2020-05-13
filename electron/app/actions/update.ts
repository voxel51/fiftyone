import io from "socket.io-client";
import { GetState, Dispatch } from "../reducers/types";

export const UPDATE = "UPDATE";
export const PORT = "PORT";
export const CONNECTED = "CONNECTED";
export const LOADING = "LOADING";

function doUpdateState(data) {
  return {
    type: UPDATE,
    data: data,
  };
}

export function updateState(data) {
  return (dispatch) => {
    return dispatch(doUpdateState(data));
  };
}

function doUpdatePort(data) {
  return {
    type: PORT,
    data: data,
  };
}

export function updatePort(data) {
  return (dispatch) => {
    return dispatch(doUpdatePort(data));
  };
}

function doUpdateConnected(data) {
  return {
    type: CONNECTED,
    data: data,
  };
}

export function updateConnected(data) {
  return (dispatch) => {
    return dispatch(doUpdateConnected(data));
  };
}

function doUpdateLoading(data) {
  return {
    type: LOADING,
    data: data,
  };
}

export function updateLoading(data) {
  return (dispatch) => {
    return dispatch(doUpdateLoading(data));
  };
}
