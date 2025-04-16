"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import posixpath
from importlib import metadata
from typing import (
    Any,
    BinaryIO,
    Callable,
    Dict,
    Iterator,
    Mapping,
    Optional,
    Union,
)

import backoff
import pymongo
import requests
import fiftyone as fo
from typing_extensions import Literal

from fiftyone.api import constants, errors, socket, encodings

logger = logging.getLogger(__name__)


def fatal_http_code(e):
    return 400 <= e.response.status_code < 500


class Client:
    """Class for communicating with Enterprise API"""

    @staticmethod
    def _chunk_generator_factory(
        s: Union[str, bytes], chunk_size=constants.CHUNK_SIZE
    ) -> Callable[[], Iterator[bytes]]:
        def _gen() -> Iterator[bytes]:

            bytes_ = s.encode() if isinstance(s, str) else s

            for byte_chunk in [
                bytes_[i : i + chunk_size]
                for i in range(0, len(bytes_), chunk_size)
            ]:
                yield byte_chunk

        return _gen

    def __init__(
        self,
        base_url: str,
        key: str = None,
        token: str = None,
        timeout: Optional[
            Union[int, tuple[int, int]]
        ] = constants.DEFAULT_TIMEOUT,
        disable_websocket_info_logs: bool = True,
    ):
        self.__base_url = base_url
        self.__key = key
        self.__token = token
        self._timeout = timeout
        self.__disable_websocket_info_logs = disable_websocket_info_logs
        self._content_encoding = None
        self._session = requests.Session()
        try:
            version = metadata.version("fiftyone")
        except metadata.PackageNotFoundError:
            version = ""
        self._extra_headers = {
            "User-Agent": f"FiftyOne Enterprise client/{version}",
            "X-FiftyOne-SDK-Version": version,
            "X-FiftyOne-Pymongo-Version": pymongo.version,
        }
        if self.__key:
            self._extra_headers["X-API-Key"] = self.__key
        elif self.__token:
            self._extra_headers["Authorization"] = self.__token
        else:
            raise ValueError(
                "Client requires either key or token to authenticate"
            )

        self._session.headers.update(self._extra_headers)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__class__):
            return self.base_url == other.base_url and self.key == self.key
        return NotImplemented

    def __repr__(self):
        return f"{self.__class__.__name__}(base_url='{self.__base_url}')"

    @property
    def base_url(self):
        """Base URL to Enterprise Api"""
        return self.__base_url

    @property
    def key(self):
        """Key for authenticating Enterprise Api"""
        return self.__key

    def get(self, url_path: str) -> requests.Response:
        return self.__request("GET", url_path)

    def options(self, url_path: str) -> requests.Response:
        """Make options request"""
        return self.__request("OPTIONS", url_path)

    def post(
        self,
        url_path: str,
        payload: Any,
        stream: bool = False,
        timeout: Optional[int] = None,
        is_idempotent: bool = True,
    ) -> Any:
        """Make post request"""
        payload = encodings.apply_encoding(payload, self._content_encoding)
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
            is_idempotent=is_idempotent,
        )

        # Use response as context manager to ensure it's closed.
        # https://requests.readthedocs.io/en/latest/user/advanced/#body-content-workflow
        with response:
            if stream:
                # Iter in chunks rather than lines since data isn't newline delimited
                content = b"".join(
                    chunk
                    for chunk in response.iter_content(
                        chunk_size=constants.CHUNK_SIZE
                    )
                    if chunk
                )
                return encodings.apply_decoding(
                    content, self._content_encoding
                )

            return encodings.apply_decoding(
                response.content, self._content_encoding
            )

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
            self.__disable_websocket_info_logs,
            self._content_encoding,
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
            raise errors.FiftyOneEnterpriseAPIError(
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

    def __request(
        self,
        method: Literal["POST", "GET", "OPTIONS"],
        url_path: str,
        timeout: Optional[int] = None,
        data_generator_factory: Optional[Callable[[], Iterator[bytes]]] = None,
        is_idempotent: bool = True,
        **request_kwargs,
    ):
        timeout = timeout or self._timeout
        url = posixpath.join(self.__base_url, url_path)

        # Use data generator factory to get a data generator.
        #   Need this so that we get a fresh generator if we retry via backoff.
        if data_generator_factory is not None:
            data_generator = data_generator_factory()
            request_kwargs["data"] = data_generator

        # If the request is not idempotent, don't automatically retry on read timeouts
        # as the operation may have already been applied
        max_tries = 5 if is_idempotent else 1
        max_time = timeout * max_tries

        # Using nested function to pass variables to the decorator
        @backoff.on_exception(
            backoff.expo,
            requests.exceptions.HTTPError,
            max_time=max_time,
            giveup=fatal_http_code,  # 500 errors are possibly recoverable but 400 are not
        )
        @backoff.on_exception(
            backoff.expo,
            requests.exceptions.ConnectionError,
            max_tries=max_tries,
        )
        @backoff.on_exception(
            backoff.expo,
            requests.exceptions.ReadTimeout,
            max_time=max_time,
            max_tries=max_tries,
        )
        def _request_with_backoff(_method, _url, _timeout, **_request_kwargs):
            return self._session.request(
                _method, url=_url, timeout=_timeout, **_request_kwargs
            )

        response = _request_with_backoff(
            method, url, timeout, **request_kwargs
        )
        if response.status_code == 401:
            raise errors.APIAuthenticationError(response.text)

        if response.status_code == 403:
            raise errors.APIForbiddenError(response.text)

        response.raise_for_status()

        return response


class PymongoClient(Client):
    """Class for interfacing with Enterprise API proxy endpoints."""

    def __init__(
        self,
        base_url: str,
        key: str = None,
        token: str = None,
        timeout: Optional[
            Union[int, tuple[int, int]]
        ] = constants.DEFAULT_TIMEOUT,
        disable_websocket_info_logs: bool = True,
    ):
        super().__init__(
            base_url=base_url,
            key=key,
            token=token,
            timeout=timeout,
            disable_websocket_info_logs=disable_websocket_info_logs,
        )
        self._content_encoding = self._get_content_headers()
        headers = {
            "Content-Type": "application/x-python",
            "Content-Encoding": ", ".join(self._content_encoding),
        }
        self._session.headers.update(headers)
        self._extra_headers.update(headers)

    def _get_content_headers(self) -> tuple[str, str]:
        """Returns a list for how to transfer data to the server."""
        accept = self.options("_pymongo").headers.get("Accept-Encoding")
        options = accept.split(", ") if accept else []
        if not options:
            logger.debug(
                "Server version does not support compression or byte transfer method,"
                + "defaulting to None and str. Upgrade server version to use these features."
            )
            # this means they have an older version of the API
            # default to existing behavior
            return ["pickle", "base64", "str"]

        headers = ["pickle"]

        if fo.config.api_compressor in options:
            headers += [fo.config.api_compressor]
        else:
            if fo.config.api_compressor != "none":
                logger.debug(
                    "Compressor %s not supported by server version, defaulting to None",
                    fo.config.api_compressor,
                )

        if fo.config.api_transfer_method == "str":
            headers += ["base64", "str"]

        return headers
