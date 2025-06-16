"""
Unit tests for delegated ops doc.
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pytest


from fiftyone.factory import repos
from fiftyone.operators import ExecutionContext


@pytest.fixture(name="delegated_operation_doc")
def fixture_delegated_operation_doc():
    return


class TestDelegatedOperationDoc:
    @pytest.mark.parametrize(
        "update_dict,expected_num_tasks",
        [
            pytest.param({}, None, id="empty"),
            pytest.param({"group_id": "set"}, None, id="group-id-set"),
            pytest.param(
                {"context": ExecutionContext(request_params=None)},
                None,
                id="request-params-none",
            ),
            pytest.param(
                {
                    "context": ExecutionContext(
                        request_params={"params": {"meohmy": "else"}}
                    )
                },
                None,
                id="no-tasks-in-request-params",
            ),
            pytest.param(
                {
                    "context": ExecutionContext(
                        request_params={"num_distributed_tasks": None}
                    )
                },
                None,
                id="num-tasks-explicitly-none",
            ),
            pytest.param(
                {
                    "context": ExecutionContext(
                        request_params={"num_distributed_tasks": 10}
                    )
                },
                None,
                id="num-tasks-but-not-allowed",
            ),
        ],
    )
    def test_num_distributed_tasks(self, update_dict, expected_num_tasks):
        op_doc = repos.DelegatedOperationDocument()
        for k, v in update_dict.items():
            setattr(op_doc, k, v)

        #####
        assert op_doc.num_distributed_tasks == expected_num_tasks
        #####
