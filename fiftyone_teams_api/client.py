"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from typing import Any, Dict, Mapping, Optional

import backoff
import requests

from fiftyone_teams_api import constants
from fiftyone_teams_api import errors
from fiftyone_teams_api import socket


class Client:
    """Class for communicating with Teams API"""

    def __init__(
        self,
        base_url: str,
        key: str,
        timeout: Optional[int] = constants.DEFAULT_TIMEOUT,
    ):
        self.__base_url = base_url
        self.__key = key
        self._timeout = timeout

        self._session = requests.Session()
        self._session.headers.update({"X-API-Key": self.__key})

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__class__):
            return self.base_url == other.base_url and self.key == self.key
        return NotImplemented

    @property
    def base_url(self):
        """Base URL to Teams Api"""
        return self.__base_url

    @property
    def key(self):
        """Key for authenticating Teams Api"""
        return self.__key

    @backoff.on_exception(
        backoff.expo, requests.exceptions.ConnectionError, max_tries=5
    )
    @backoff.on_exception(
        backoff.expo, requests.exceptions.ReadTimeout, max_time=60
    )
    def get(self, url_path: str) -> requests.Response:
        url = os.path.join(self.__base_url, url_path)
        response = self._session.get(url=url, timeout=self._timeout)
        if response.status_code in [401, 403]:
            raise errors.APIAuthenticationError

        response.raise_for_status()
        return response

    def post(self, url_path: str, payload: Dict[str, Any]) -> Any:
        """Make post request"""
        response = self._post(url_path, data=payload)

        return response.content

    def post_json(self, url_path: str, payload: Dict[str, Any]) -> Any:
        """Make post request with json payload"""
        response = self._post(url_path, json=payload)

        return response.json()

    def socket(self, url_path: str) -> socket.Socket:
        """Create a websocket connection"""
        return socket.Socket(
            self.__base_url, url_path, {"X-API-Key": self.__key}, self._timeout
        )

    def close(self) -> None:
        """Close client session"""
        self._session.close()

    def post_graphql_request(
        self, query: str, variables: Optional[Mapping[str, Any]] = None
    ) -> Mapping[str, Any]:
        url_path = "graphql/v1"
        payload = {"query": query, "variables": variables}

        response_json = self.post_json(url_path, payload)

        if "errors" in response_json:
            raise Exception(
                *[err["message"] for err in response_json["errors"]]
            )

        return response_json["data"]

    def post_graphql_connectioned_request(
        self,
        query: str,
        connection_property: str,
        variables: Optional[Mapping[str, Any]] = None,
    ):
        variables = variables or {}

        after = None
        return_value = []
        while True:
            variables["after"] = after
            data = self.post_graphql_request(query=query, variables=variables)

            for edge in data[connection_property]["edges"]:
                return_value.append(edge["node"])

            if not data[connection_property]["pageInfo"]["hasNextPage"]:
                break

            after = data[connection_property]["pageInfo"]["endCursor"]

        return return_value

    @backoff.on_exception(
        backoff.expo, requests.exceptions.ConnectionError, max_tries=5
    )
    @backoff.on_exception(
        backoff.expo, requests.exceptions.ReadTimeout, max_time=60
    )
    def _post(self, url_path: str, **post_kwargs):
        url = os.path.join(self.__base_url, url_path)
        response = self._session.post(
            url=url, timeout=self._timeout, **post_kwargs
        )
        if response.status_code in [401, 403]:
            raise errors.APIAuthenticationError

        response.raise_for_status()
        return response
