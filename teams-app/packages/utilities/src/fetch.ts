export default async function fotFetch(
  resource: RequestInfo | URL,
  options?: RequestInit
) {
  try {
    // todo: use fetch from OSS?
    const response = await fetch(resource, options);
    const status = response.status;
    const statusText = response.statusText;

    if (status >= 400) {
      // todo: use error from OSS
      const { result } = await parseResponseBody(response);
      const serverMessage = getErrorMessage(result);
      const message = serverMessage || statusText || 'Something went wrong';
      throw new Error(`${status}: ${message}`);
    }

    const { result, error } = await parseResponseBody(response);

    return { result, error };
  } catch (error) {
    console.error(error);
    return { error };
  }
}

async function parseResponseBody(response: Response) {
  try {
    const contentType = response.headers.get('content-type');
    const body = await (contentType === 'application/json'
      ? response.json()
      : response.text());
    return { result: body };
  } catch (error) {
    console.error(error);
    return { error };
  }
}

function getErrorMessage(result: string) {
  // SanicException
  if (typeof result === 'string' && result.includes('===')) {
    return result.split(/={3,}/)[1].trim();
  }
}
