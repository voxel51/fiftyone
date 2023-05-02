"""
FiftyOne operator permissions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from enum import Enum
from .registry import OperatorRegistry
from .loader import load_from_dir
import requests

class RequestType(Enum):
    LIST = 1
    EXEC = 2

class PermissionedOperatorRegistry(OperatorRegistry):
    def __init__(self, request_type, managed_operators):
        self.request_type = request_type
        self.managed_operators = managed_operators
        super().__init__()

    def list_operators(self):
        """Lists the available FiftyOne operators.

        Returns:
            a list of operators
        """
        operators = super().list_operators()
        return [
            o for o in operators if self.managed_operators.has_operator(o.uri)
        ]

    @classmethod
    def from_list_request(cls, request):
        token = get_token_from_request(request)
        raw_operators = get_available_operators(token)
        return PermissionedOperatorRegistry(
            request_type=RequestType.LIST,
            managed_operators=ManagedOperators.from_json(raw_operators),
        )

    @classmethod
    def from_exec_request(cls, request):
        token = get_token_from_request(request)
        raw_operators = get_available_operators(token)
        return PermissionedOperatorRegistry(
            request_type=RequestType.EXEC,
            managed_operators=ManagedOperators.from_json(raw_operators),
        )

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
            plugin_name=json.get("pluginPackage", None),
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


_PLUGINS_QUERY = """
query ListAvailableOperators($datasetIds: [String!], $onlyEnabled: Boolean) {
    operators(datasetIds: $datasetIds, onlyEnabled: $onlyEnabled) {
        name
        enabled
        pluginPackage
        uri
    }
}
"""


def get_available_operators(token, dataset_ids=None, only_enabled=True):
    result = make_request(
        "http://localhost:8000/graphql/v1",
        token,
        _PLUGINS_QUERY,
        variables={"datasetIds": dataset_ids, "onlyEnabled": only_enabled},
    )
    return result.get("data", {}).get("operators", [])
