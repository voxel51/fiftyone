"""
FiftyOne Server

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# oss
from fiftyone.factory.repos.delegated_operation_doc import (
    DelegatedOperationDocument,
)

# oss
QUEUE_DELEGATED_OP_PROPS = [
    "operator",
    "delegation_target",
    "dataset_id",
    "context",
]

# # teams
# from fiftyone.factory.repos.delegated_operation_doc import DelegatedOperationDocument as BaseDelegatedOperationDocument
# from bson import ObjectId
#
# # teams
# QUEUE_DELEGATED_OP_PROPS = ["operator", "delegation_target", "dataset_id", "context", "run_by"]
#
#
# class DelegatedOperationDocument(BaseDelegatedOperationDocument):
#
#     def __init__(self, **kwargs: QUEUE_DELEGATED_OP_PROPS):
#         super().__init__(operator=kwargs.get("operator", None),
#                          delegation_target=kwargs.get("delegation_target", None),
#                          dataset_id=kwargs.get("dataset_id", None),
#                          context=kwargs.get("context", None))
#         self.run_by = kwargs.get("run_by", None)
#
#     def from_pymongo(self, doc: dict):
#         super().from_pymongo(doc)
#         self.run_by = doc["run_by"] if "run_by" in doc else None
#         return self
