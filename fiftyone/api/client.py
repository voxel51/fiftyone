"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import functools
import os
from importlib import metadata
from typing import Any, BinaryIO, Dict, Iterator, Mapping, Optional
from typing_extensions import Literal

import backoff
import requests

from fiftyone.api import constants, errors, socket


class Client:
    """Class for communicating with Teams API"""

    @staticmethod
    def _chunk_generator(
        s: str, chunk_size=constants.CHUNK_SIZE
    ) -> Iterator[bytes]:
        bytes_ = s.encode()
        for byte_chunk in [
            bytes_[i : i + chunk_size]
            for i in range(0, len(bytes_), chunk_size)
        ]:
            yield byte_chunk

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
        try:
            version = metadata.version("fiftyone")
        except metadata.PackageNotFoundError:
            version = ""
        self._extra_headers = {
            "X-API-Key": self.__key,
            "User-Agent": f"FiftyOne Teams client/{version}",
        }
        self._session.headers.update(self._extra_headers)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__class__):
            return self.base_url == other.base_url and self.key == self.key
        return NotImplemented

    def __repr__(self):
        return f"{self.__class__.__name__}(base_url='{self.__base_url}')"

    @property
    def base_url(self):
        """Base URL to Teams Api"""
        return self.__base_url

    @property
    def key(self):
        """Key for authenticating Teams Api"""
        return self.__key

    def get(self, url_path: str) -> requests.Response:
        return self.__request("GET", url_path)

    def post(self, url_path: str, payload: str, stream: bool = False) -> Any:
        """Make post request"""

        data = payload
        headers = {}

        if stream:
            data = self._chunk_generator(payload)
            headers["Transfer-Encoding"] = "chunked"

        response = self.__request(
            "POST", url_path, data=data, headers=headers, stream=stream
        )

        if stream:
            return functools.reduce(
                lambda res, line: res + line, response.iter_lines(), b""
            )

        return response.content

    def post_file(self, url_path: str, file: BinaryIO):
        response = self.__request(
            "POST",
            url_path,
            files={"file": (file.name, file, "application/octet-stream")},
        )
        return response.content

    def post_json(self, url_path: str, payload: Dict[str, Any]) -> Any:
        """Make post request with json payload"""
        response = self.__request("POST", url_path, json=payload)

        return response.json()

    def socket(self, url_path: str) -> socket.Socket:
        """Create a websocket connection"""
        return socket.Socket(
            self.__base_url,
            url_path,
            self._extra_headers,
            self._timeout,
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
    def __request(
        self, method: Literal["POST", "GET"], url_path: str, **request_kwargs
    ):
        url = os.path.join(self.__base_url, url_path)

        response = self._session.request(
            method, url=url, timeout=self._timeout, **request_kwargs
        )

        if response.status_code == 401:
            raise errors.APIAuthenticationError(response.text)

        if response.status_code == 403:
            raise errors.APIForbiddenError(response.text)

        response.raise_for_status()

        return response
