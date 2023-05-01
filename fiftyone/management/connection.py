"""
Make connection to teams API client in the style of
    fiftyone.core.odm.database

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import requests.exceptions

import fiftyone.core.config as _foc
import fiftyone_teams_api


class ApiClientConnection(object):
    instance = None

    def __init__(self):
        # If we're re-init'ing shared instance, no need to set it twice
        try:
            self.__client
        except AttributeError:
            self.__client = None

    def __new__(cls):
        if not hasattr(cls, "instance") or getattr(cls, "instance") is None:
            cls.instance = super(ApiClientConnection, cls).__new__(cls)
        return cls.instance

    def reload(self):
        # Force reload by setting to none then calling client property
        self.__client = None
        self.client

    @property
    def client(self):
        if self.__client is None:
            config = _foc.load_config()
            if not config.api_uri:
                raise ConnectionError(
                    "Cannot connect to API without a URI specified."
                )
            if not config.api_key:
                raise ConnectionError(
                    "Cannot connect to API without an API key."
                )
            self.__client = fiftyone_teams_api.Client(
                config.api_uri, config.api_key
            )
        return self.__client


def reload_api_connection() -> None:
    """
    Reloads the API connection. This is necessary if the API URI
        or API Key are changed after the first usage of this module.
        This should rarely be needed unless if a script is working
        across deployments.
        E.g.
        ```
        import fiftyone.management as fom
        import fiftyone as fo

        # https://api.dev.mycompany.org
        print(fo.config.api_uri)
        fom.whoami()

        # Change API URI, need to reload cached connection
        fo.config.api_uri = "https://api.test.mycompany.org"
        fom.reload_api_connection()
        fom.whoami()
        ```

    Args:
        None

    Returns:
        None
    """
    conn = ApiClientConnection()
    conn.reload()


def test_api_connection():
    """
    Tests the API connection with progressively more intensive
        approaches. Either raises an exception if it fails, or
        prints "API Connection Succeeded"

    Args:
        None

    Returns:
        None
    """
    client = ApiClientConnection().client
    try:
        status = client.get("health").json().get("status")
        if status != "available":
            raise requests.exceptions.ConnectionError(
                f"Bad server status: '{status}'"
            )
        resp = client.post_graphql_request("query {viewer {id}}")
        if not resp.get("viewer"):
            raise requests.exceptions.ConnectionError(
                "whoami() did not succeed"
            )
    except Exception as e:
        raise Exception("Test API Connection Failed") from e

    print("API Connection Succeeded")
