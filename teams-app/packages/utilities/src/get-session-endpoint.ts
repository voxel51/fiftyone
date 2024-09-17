import { SESSION_ENDPOINT } from '@fiftyone/teams-state/src/constants';

const DEFAULT_REDIRECT = '/';

export default function getSessionEndpoint(redirect?: string) {
  return `${SESSION_ENDPOINT}?redirect=${encodeURIComponent(
    redirect || DEFAULT_REDIRECT
  )}`;
}
