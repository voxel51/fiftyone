"""
FiftyOne delegated operator related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import time
import unittest
import uuid
from typing import List
from unittest.mock import patch

import fiftyone
from bson import ObjectId

from fiftyone import Dataset
from fiftyone.factory import (
    OrchestratorPagingParams,
    SortDirection,
    SortByField,
)
from fiftyone.operators.orchestrator import OrchestratorService
from fiftyone.operators.operator import Operator, OperatorConfig


def mock_operators() -> List[Operator]:
    ops = []
    for i in range(10):
        ops.append(MockOperator(i))
    return ops


class MockOperator(Operator):
    def __init__(self, idx, **kwargs):
        super().__init__(**kwargs)
        self.idx = idx

    @property
    def config(self):
        return OperatorConfig(
            name=f"mock_operator_{self.idx}",
            label="Mock Operator_{self.idx}",
            disable_schema_validation=True,
        )


@patch(
    "fiftyone.operators.registry.OperatorRegistry.list_operators",
    return_value=mock_operators(),
)
class OrchestratorServiceTests(unittest.TestCase):
    def setUp(self):
        self.docs_to_delete = []
        self.svc = OrchestratorService()

    def tearDown(self):
        self.delete_test_data()

    def delete_test_data(self):
        seen = set()
        unique = [
            obj
            for obj in self.docs_to_delete
            if obj.instance_identifier not in seen
            and not seen.add(obj.instance_identifier)
        ]
        for doc in unique:
            self.svc.delete(instance_identifier=doc.instance_identifier)

    def test_register_and_update(self, mock_list_operators):
        instance_identifier = str(uuid.uuid4())
        doc = self.svc.register(
            instance_identifier=instance_identifier, description="test"
        )
        self.docs_to_delete.append(doc)
        self.assertIsNotNone(doc.available_operators)
        self.assertEqual(doc.instance_identifier, instance_identifier)

        doc = self.svc.register(
            instance_identifier=instance_identifier, description="test2"
        )
        self.docs_to_delete.append(doc)
        self.assertIsNotNone(doc.available_operators)
        self.assertEqual(
            doc.available_operators, [x.uri for x in mock_operators()]
        )
        self.assertEqual(doc.instance_identifier, instance_identifier)
        self.assertEqual(doc.description, "test2")

    def test_get(self, mock_list_operators):
        instance_identifier = str(uuid.uuid4())
        doc = self.svc.register(
            instance_identifier=instance_identifier, description="test"
        )
        self.docs_to_delete.append(doc)
        doc = self.svc.get(instance_identifier=instance_identifier)
        self.assertEqual(doc.instance_identifier, instance_identifier)

    def test_deactivate(self, mock_list_operators):
        instance_identifier = str(uuid.uuid4())
        doc = self.svc.register(
            instance_identifier=instance_identifier, description="test"
        )
        self.docs_to_delete.append(doc)
        doc = self.svc.deactivate(instance_identifier=instance_identifier)
        self.assertIsNotNone(doc.deactivated_at)

    def test_list(self, mock_list_operators):

        instance_identifiers = []
        for x in range(25):
            instance_identifiers.append("test_" + str(uuid.uuid4()))

        for x in range(25):
            doc = self.svc.register(
                instance_identifier=instance_identifiers[x],
                description=f"test_{x}",
            )
            self.docs_to_delete.append(doc)

        docs = self.svc.list()
        self.assertEqual(len(docs), 10)

        mock_list_operators.return_value = mock_list_operators.return_value + [
            MockOperator(100)
        ]
        doc = self.svc.register(
            instance_identifier=instance_identifiers[24],
            description=f"test_24",
        )

        docs = self.svc.list(paging=OrchestratorPagingParams(skip=0, limit=50))
        self.assertEqual(len(docs), 25)

        self.svc.deactivate(instance_identifier=instance_identifiers[0])
        docs = self.svc.list(paging=OrchestratorPagingParams(skip=0, limit=50))
        self.assertEqual(len(docs), 24)

        docs = self.svc.list(
            paging=OrchestratorPagingParams(skip=0, limit=50),
            include_deactivated=True,
        )
        self.assertEqual(len(docs), 25)

        # returns no matches
        docs = self.svc.list(
            paging=OrchestratorPagingParams(skip=0, limit=50),
            include_deactivated=True,
            search={"noop": ["instance_identifier"]},
        )
        self.assertEqual(len(docs), 0)

        # matches all the instance identifiers
        docs = self.svc.list(
            paging=OrchestratorPagingParams(skip=0, limit=50),
            include_deactivated=True,
            search={"test": ["instance_identifier"]},
        )
        self.assertEqual(len(docs), 25)

        docs = self.svc.list(
            paging=OrchestratorPagingParams(skip=0, limit=50),
            include_deactivated=True,
            search={"mock": ["available_operators"]},
        )
        self.assertEqual(len(docs), 25)

        docs = self.svc.list(
            paging=OrchestratorPagingParams(skip=0, limit=50),
            include_deactivated=True,
            search={"mock_operator_100": ["available_operators"]},
        )
        self.assertEqual(len(docs), 1)

        self.svc.deactivate(instance_identifier=instance_identifiers[24])
        docs = self.svc.list(
            paging=OrchestratorPagingParams(skip=0, limit=50),
            search={"mock_operator_100": ["available_operators"]},
        )
        self.assertEqual(len(docs), 0)
