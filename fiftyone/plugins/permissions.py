"""
FiftyOne operator permissions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import aiohttp
from aiohttp.http_exceptions import InvalidHeader

from fiftyone.internal.util import is_internal_service


class ManagedPlugins:
    def __init__(self, plugins):
        self.plugins = plugins

    def get_plugin_definition(self, name):
        for plugin in self.plugins:
            if plugin.name == name:
                return plugin
        return None

    def has_plugin(self, name):
        return self.get_plugin_definition(name) is not None

    def has_enabled_plugin(self, name):
        plugin = self.get_plugin_definition(name)
        if plugin:
            return plugin.enabled
        return False

    @classmethod
    def from_json(cls, json):
        return ManagedPlugins(
            plugins=[RemotePluginDefinition.from_json(p) for p in json]
        )

    @classmethod
    async def for_request(cls, request):
        token = get_token_from_request(request)
        raw_plugins = await get_available_plugins(token)
        return ManagedPlugins.from_json(raw_plugins)


class ManagedOperators:
    def __init__(self, operators):
        self.operators = operators

    def get_operator_definition(self, uri):
        for operator in self.operators:
            if operator.uri == uri:
                return operator
        return None

    def has_operator(self, uri):
        return self.get_operator_definition(uri) is not None

    @classmethod
    def from_json(cls, json):
        return ManagedOperators(
            operators=[RemoteOperatorDefinition.from_json(o) for o in json]
        )

    @classmethod
    async def for_request(cls, request, dataset_ids=None):
        token = get_token_from_request(request)
        raw_operators = await get_available_operators(
            token, dataset_ids=dataset_ids
        )
        return ManagedOperators.from_json(raw_operators)


class RemotePluginDefinition:
    def __init__(self, name, enabled=False):
        self.name = name
        self.enabled = enabled

    @classmethod
    def from_json(cls, json):
        return RemotePluginDefinition(
            name=json["name"],
            enabled=json.get("enabled", False),
        )


class RemoteOperatorDefinition:
    def __init__(self, plugin_name, name, uri, enabled=None, permission=None):
        self.plugin_name = plugin_name
        self.name = name
        self.uri = uri
        self.enabled = enabled
        self.permission = permission

    @classmethod
    def from_json(cls, json):
        return RemoteOperatorDefinition(
            plugin_name=json.get("pluginName", None),
            name=json["name"],
            uri=json["uri"],
            enabled=json.get("enabled", False),
        )


def get_header_token(authorization: str):
    if not authorization:
        return False

    parts = authorization.split()

    if parts[0].lower() != "bearer":
        return False

    if len(parts) == 1:
        return False

    if len(parts) > 2:
        return False

    return parts[1]


def get_token_from_request(request):
    header = request.headers.get("Authorization", None)
    cookie = request.cookies.get("fiftyone-token", None)
    if header:
        return get_header_token(header)
    elif cookie:
        return cookie


# an example using the requests module to make a request to a graphql
# server returning the results in a dictionary
async def make_request(url, access_token, query, variables=None):
    headers = {
        "Content-Type": "application/json",
    }
    if access_token:
        headers["Authorization"] = access_token
    else:
        # if no access token is provided, but running as an internal service,
        # use an API key (TODO: replace with a service account token for
        #  internal authentication?)
        if is_internal_service() and os.getenv("FIFTYONE_API_KEY"):
            headers["X-API-Key"] = os.getenv("FIFTYONE_API_KEY")
        else:
            raise InvalidHeader(
                f"No access token provided and not running as an internal "
                f"service. Cannot complete request.\nquery={query}"
            )
    async with aiohttp.ClientSession() as session:
        async with session.post(
            url, headers=headers, json={"query": query, "variables": variables}
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                if "errors" in result:
                    for error in result["errors"]:
                        print(error)
                    raise Exception(f"Query failed with errors. {query}")
                return result
            else:
                raise Exception(
                    f"Query failed to run by returning code of "
                    f"{resp.status}. {query}"
                )


_AVAIL_OPERATORS_QUERY = """
query ListAvailableOperators($datasetIds: [String!], $onlyEnabled: Boolean) {
    operators(datasetIds: $datasetIds, onlyEnabled: $onlyEnabled) {
        name
        enabled
        pluginName
        uri
    }
}
"""
_AVAIL_PLUGINS_QUERY = """
query ListAvailablePlugins {
  plugins {
    enabled
    name
  }
}
"""

_API_URL = os.environ.get("API_URL", "http://localhost:8000")


async def get_available_operators(token, dataset_ids=None, only_enabled=True):
    result = await make_request(
        f"{_API_URL}/graphql/v1",
        token,
        _AVAIL_OPERATORS_QUERY,
        variables={"datasetIds": dataset_ids, "onlyEnabled": only_enabled},
    )
    return result.get("data", {}).get("operators", [])


async def get_available_plugins(token):
    result = await make_request(
        f"{_API_URL}/graphql/v1", token, _AVAIL_PLUGINS_QUERY
    )
    return result.get("data", {}).get("plugins", [])
