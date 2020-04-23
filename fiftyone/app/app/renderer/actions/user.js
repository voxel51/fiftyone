import { createAction } from "redux-actions";

export default {
  login: createAction("USER_LOGIN"),
  logout: createAction("USER_LOGOUT"),
};
