"""
API connection.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import requests.exceptions

import fiftyone.api
import fiftyone.core.config as foc


class APIClientConnection(object):
    instance = None

    def __init__(self):
        # If we're re-init'ing shared instance, no need to set it twice
        try:
            self.__client
        except AttributeError:
            self.__client = None

    def __new__(cls):
        if not hasattr(cls, "instance") or getattr(cls, "instance") is None:
            cls.instance = super(APIClientConnection, cls).__new__(cls)
        return cls.instance

    def reload(self):
        # Force reload by setting to none then calling client property
        self.__client = None
        self.client

    @property
    def client(self):
        if self.__client is None:
            config = foc.load_config()
            if not config.api_uri:
                raise ConnectionError(
                    "Cannot connect to API without a URI specified."
                )
            if not config.api_key:
                raise ConnectionError(
                    "Cannot connect to API without an API key."
                )
            self.__client = fiftyone.api.Client(config.api_uri, config.api_key)
        return self.__client


def reload_api_connection() -> None:
    """Reloads the API connection.

    This is necessary if the API URI or API key are changed after the first
    usage of this module.

    .. note::

        This should rarely be needed unless a script is working across deployments.

    Examples::

        import fiftyone.management as fom
        import fiftyone as fo

        # https://api.dev.mycompany.org
        print(fo.config.api_uri)
        fom.whoami()

        # Change API URI, need to reload cached connection
        fo.config.api_uri = "https://api.test.mycompany.org"
        fom.reload_api_connection()
        fom.whoami()
    """
    conn = APIClientConnection()
    conn.reload()


def test_api_connection():
    """Tests the API connection.

    If the connection succeeds, a message will be printed. If the connection
    failes, an exception will be raised.

    Examples::

        import fiftyone.management as fom
        fom.test_api_connection() # API connection succeeded

    """
    client = APIClientConnection().client
    try:
        status = client.get("health").status_code
        if status != 200:
            raise requests.exceptions.ConnectionError(
                f"Bad server status: '{status}'"
            )
        resp = client.post_graphql_request("query {viewer {id}}")
        if not resp.get("viewer"):
            raise requests.exceptions.ConnectionError(
                "whoami() did not succeed"
            )
    except Exception as e:
        raise Exception("Test API connection failed") from e

    print("API connection succeeded")
