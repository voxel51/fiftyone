import { SIGN_IN_PAGE_ENDPOINT } from "@fiftyone/teams-state/src/constants";
import type { NextApiRequest, NextApiResponse } from "next";

// Handle legacy mode invitation flow
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { invitation, organization_name } = req.query;
  const urlQuery = new URLSearchParams();
  urlQuery.append("invitation", invitation as string);
  urlQuery.append("organization_name", organization_name as string);
  const inviteEndpoint = `${SIGN_IN_PAGE_ENDPOINT}?${urlQuery.toString()}`;
  res.redirect(inviteEndpoint);
}
