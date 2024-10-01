import {
  CSRF_ENDPOINT,
  SIGN_OUT_ENDPOINT
} from '@fiftyone/teams-state/src/constants';

export default async function casSignOut() {
  try {
    const csrfResponse = await fetch(CSRF_ENDPOINT);
    const csrf = await csrfResponse.text();
    await fetch(SIGN_OUT_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: csrf
    });
  } catch (e) {
    console.error(e);
  }
}
