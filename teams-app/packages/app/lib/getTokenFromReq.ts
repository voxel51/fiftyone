import { getSessionCookieName } from "@fiftyone/teams-utilities";
import cookie from "cookie";
import { IncomingMessage } from "http";

export default function getTokenFromReq(req: IncomingMessage) {
  const cookieName = getSessionCookieName();
  const cookies = cookie.parse(req.headers.cookie || "");
  return cookies[cookieName];
}
