"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import functools
import os

try:
    from importlib import metadata
except ImportError:
    # for Python 3.7
    import importlib_metadata as metadata

from typing import Any, BinaryIO, Callable, Dict, Iterator, Mapping, Optional

import backoff
import requests
from typing_extensions import Literal

from fiftyone.api import constants, errors, socket


def fatal_http_code(e):
    return 400 <= e.response.status_code < 500


class Client:
    """Class for communicating with Teams API"""

    @staticmethod
    def _chunk_generator_factory(
        s: str, chunk_size=constants.CHUNK_SIZE
    ) -> Callable[[], Iterator[bytes]]:
        def _gen() -> Iterator[bytes]:
            bytes_ = s.encode()
            for byte_chunk in [
                bytes_[i : i + chunk_size]
                for i in range(0, len(bytes_), chunk_size)
            ]:
                yield byte_chunk

        return _gen

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

    def post(
        self,
        url_path: str,
        payload: str,
        stream: bool = False,
        timeout: Optional[int] = None,
    ) -> Any:
        """Make post request"""

        data = payload
        headers = {}

        data_generator_factory = None
        if stream:
            data = None
            data_generator_factory = self._chunk_generator_factory(payload)
            headers["Transfer-Encoding"] = "chunked"

        response = self.__request(
            "POST",
            url_path,
            timeout,
            data_generator_factory=data_generator_factory,
            data=data,
            headers=headers,
            stream=stream,
        )
        # Use response as context manager to ensure it's closed.
        # https://requests.readthedocs.io/en/latest/user/advanced/#body-content-workflow
        with response:
            if stream:
                return functools.reduce(
                    lambda res, line: res + line, response.iter_lines(), b""
                )

            return response.content

    def post_file(
        self,
        url_path: str,
        file: BinaryIO,
        timeout: Optional[int] = None,
    ):
        response = self.__request(
            "POST",
            url_path,
            timeout,
            files={"file": (file.name, file, "application/octet-stream")},
        )
        return response.content

    def post_json(
        self,
        url_path: str,
        payload: Dict[str, Any],
        timeout: Optional[int] = None,
    ) -> Any:
        """Make post request with json payload"""
        response = self.__request("POST", url_path, timeout, json=payload)

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
        self,
        query: str,
        variables: Optional[Mapping[str, Any]] = None,
        timeout: Optional[int] = None,
    ) -> Mapping[str, Any]:
        """Post a GraphQL request

        Args:
            query:  The GraphQL query string
            variables: Optional variables to pass to query
            timeout: Optional timeout to override the default
        """
        url_path = "graphql/v1"
        payload = {"query": query, "variables": variables}

        response_json = self.post_json(url_path, payload, timeout)

        if "errors" in response_json:
            raise errors.FiftyOneTeamsAPIError(
                *[err["message"] for err in response_json["errors"]]
            )

        return response_json["data"]

    def post_graphql_connectioned_request(
        self,
        query: str,
        connection_property: str,
        variables: Optional[Mapping[str, Any]] = None,
        timeout: Optional[int] = None,
    ):
        """Post a GraphQL request that uses the connection paging method

        Args:
            query:  The GraphQL query string
            connection_property: The property name that contains the
                paged data. Pass a '.'-separated string to indicate nested
                fields; fieldA.fieldB -> data['fieldA']['fieldB']
            variables: Optional variables to pass to query
            timeout: Optional timeout to override the default

        Raises:
            ValueError: If one of the subproperties is not found for the
                return data.
        """
        variables = variables or {}
        sub_properties = connection_property.split(".")

        after = None
        return_value = []
        while True:
            variables["after"] = after
            data = self.post_graphql_request(query=query, variables=variables)

            for sub_property in sub_properties:
                if (
                    sub_property != sub_properties[-1]
                    and data[sub_property] is None
                ):
                    raise ValueError(f"No property {sub_property} found")
                data = data[sub_property]

            for edge in data["edges"]:
                return_value.append(edge["node"])

            if not data["pageInfo"]["hasNextPage"]:
                break

            after = data["pageInfo"]["endCursor"]

        return return_value

    @backoff.on_exception(
        backoff.expo, requests.exceptions.ConnectionError, max_tries=5
    )
    @backoff.on_exception(
        backoff.expo, requests.exceptions.ReadTimeout, max_time=60
    )
    # 500 errors are possibly recoverable but 400 are not
    @backoff.on_exception(
        backoff.expo,
        requests.exceptions.HTTPError,
        max_time=60,
        giveup=fatal_http_code,
    )
    def __request(
        self,
        method: Literal["POST", "GET"],
        url_path: str,
        timeout: Optional[int] = None,
        data_generator_factory: Optional[Callable[[], Iterator[bytes]]] = None,
        **request_kwargs,
    ):
        timeout = timeout or self._timeout
        url = os.path.join(self.__base_url, url_path)

        # Use data generator factory to get a data generator.
        #   Need this so that we get a fresh generator if we retry via backoff.
        if data_generator_factory is not None:
            data_generator = data_generator_factory()
            request_kwargs["data"] = data_generator

        response = self._session.request(
            method, url=url, timeout=timeout, **request_kwargs
        )

        if response.status_code == 401:
            raise errors.APIAuthenticationError(response.text)

        if response.status_code == 403:
            raise errors.APIForbiddenError(response.text)

        response.raise_for_status()

        return response
