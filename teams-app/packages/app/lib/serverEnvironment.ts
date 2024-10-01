import { withHydrateDatetime } from 'relay-nextjs/date';
import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { API_URL } from '@fiftyone/teams-state/src/constants';

export function createServerNetwork(
  cookie: string,
  onRedirect?: (status?: number, msg?: string) => void,
  onUnauthenticated?: (status?: number, msg?: string) => void
) {
  if (!API_URL)
    throw new Error(`process.env.API_URL is a required env variable`);
  return Network.create(async (params, variables) => {
    /**
     * nextjs with getServerSideProps, it fires up a GET RESOURCE.json
     * request in addition to the core graphql POST request on page load.
     */
    if (variables?.['identifier']?.includes('.json')) {
      return Promise.resolve({ data: {} });
    }

    const response = await fetch(`${API_URL}/graphql/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      mode: 'cors',
      body: JSON.stringify({ query: params.text, variables })
    });

    const json = await response.text();

    if (response.status === 401 || response.status === 403) {
      return onUnauthenticated?.(
        response.status,
        json ? JSON.parse(json).message : ''
      );
    }

    if (json) {
      try {
        const res = JSON.parse(json, withHydrateDatetime);

        if (res.errors) {
          console.debug('graphql error in response', res.errors);
          const badPageError = res.errors.some(
            ({ message }: { message: string }) =>
              message.includes('Invalid page number')
          );
          if (badPageError) {
            onRedirect?.();
            return;
          }
        }
        return res;
      } catch (e) {
        console.error('error', e);
        throw new Error(`graphql responded with non json: ${json}`);
      }
    }
  });
}

export function createServerEnvironment(
  cookie: string,
  onUnauthenticated: () => void,
  onRedirect?: () => void
) {
  return new Environment({
    network: createServerNetwork(cookie, onRedirect, onUnauthenticated),
    store: new Store(new RecordSource()),
    isServer: true
  });
}
