"""
FiftyOne operator permissions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from enum import Enum
import requests


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

    @classmethod
    def from_json(cls, json):
        return ManagedPlugins(
            plugins=[RemotePluginDefinition.from_json(p) for p in json]
        )

    @classmethod
    def for_request(cls, request):
        token = get_token_from_request(request)
        raw_plugins = get_available_plugins(token)
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
    def for_request(cls, request):
        token = get_token_from_request(request)
        raw_operators = get_available_operators(token)
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
        token = get_header_token(header)
    elif cookie:
        token = cookie
    return token


# an example using the requests module to make an request to a graphql
# server returning the results in a dictionary
def make_request(url, access_token, query, variables=None):
    headers = {
        "Content-Type": "application/json",
        "Authorization": access_token,
    }
    request = requests.post(
        url, headers=headers, json={"query": query, "variables": variables}
    )
    if request.status_code == 200:
        result = request.json()
        if "errors" in result:
            for error in result["errors"]:
                print(error)
            raise Exception(f"Query failed with errors. {query}")
        return result
    else:
        raise Exception(
            f"Query failed to run by returning code of {request.status_code}. {query}"
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


def get_available_operators(token, dataset_ids=None, only_enabled=True):
    result = make_request(
        "http://localhost:8000/graphql/v1",
        token,
        _AVAIL_OPERATORS_QUERY,
        variables={"datasetIds": dataset_ids, "onlyEnabled": only_enabled},
    )
    return result.get("data", {}).get("operators", [])


def get_available_plugins(token):
    result = make_request(
        "http://localhost:8000/graphql/v1", token, _AVAIL_PLUGINS_QUERY
    )
    return result.get("data", {}).get("plugins", [])
