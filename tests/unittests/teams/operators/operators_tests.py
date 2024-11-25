"""
Unit tests for Teams operators concepts.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pytest
from unittest import mock

import fiftyone.internal.context_vars as ficv
from fiftyone.operators import executor
from fiftyone.operators.executor import ExecutionResult


@pytest.fixture(name="ctx_user")
def fixture_execution_context_user():
    uid = "test_user"
    tok = "my token"
    api_key = "test api key"
    user = executor.ExecutionContextUser(
        email="testuser@voxel51.com",
        id=uid,
        name="Test User",
        role="MEMBER",
        dataset_permission="MANAGE",
        _request_token=tok,
        _api_key=api_key,
    )
    return user


@pytest.fixture(name="ctx")
def fixture_execution_context(ctx_user):
    ctx = executor.ExecutionContext(
        operator_uri="test_operator",
        request_params={},
        user=ctx_user,
    )
    return ctx


def test_context_with_user_permissions(ctx):
    with ctx:
        assert ficv.running_user_id.get() == ctx.user_id
        assert ficv.running_user_request_token.get() == ctx.user_request_token
    assert ficv.running_user_id.get() is None
    assert ficv.running_user_request_token.get() is None


def test_nested_context_fail(ctx):
    """Don't allow nested 'with' statement with exec context"""
    with ctx:
        with pytest.raises(RuntimeError):
            with ctx:
                assert 0


class TestUserCodeWithPermissions:
    def _assert(self, user_id, request_token, api_key):
        assert ficv.running_user_id.get() == user_id
        assert ficv.running_user_request_token.get() == request_token
        assert ficv.running_user_api_key.get() == api_key
        assert ficv.no_singleton_cache.get()

    @pytest.mark.asyncio
    async def test_do_execute_operator(self, ctx):
        operator = mock.AsyncMock()

        def _execute(*args, **kwargs):
            self._assert(ctx.user_id, ctx.user_request_token, ctx.user_api_key)

        operator.execute.side_effect = _execute

        #####
        await executor.do_execute_operator(operator, ctx)
        #####

        operator.execute.assert_called_once()

    @pytest.mark.asyncio
    @mock.patch.object(executor, "OperatorRegistry")
    @mock.patch.object(executor, "resolve_operation_user")
    async def test_prepare_executor(
        self, resolve_operation_user_mock, OperatorRegistryMock, ctx_user
    ):
        user_dict = ctx_user.to_dict()
        user_dict.update(
            _request_token=ctx_user._request_token, _api_key=ctx_user._api_key
        )
        resolve_operation_user_mock.return_value = user_dict

        def _execute(*args, **kwargs):
            self._assert(
                ctx_user.id, ctx_user._request_token, ctx_user._api_key
            )

        operator = OperatorRegistryMock.return_value.get_operator.return_value
        operator.resolve_input.side_effect = _execute
        operator._plugin_secrets = None

        #####
        await executor.prepare_operator_executor(
            "operator",
            {"dataset_name": "dataset"},
            request_token=ctx_user._request_token,
            user="userid",
            api_key=ctx_user._api_key,
        )
        #####

        resolve_operation_user_mock.assert_called_with(
            id="userid",
            dataset="dataset",
            token=ctx_user._request_token,
            api_key=ctx_user._api_key,
        )
        operator.resolve_input.assert_called_once()

    @pytest.mark.asyncio
    @mock.patch.object(executor, "prepare_operator_executor")
    @mock.patch.object(executor, "do_execute_operator")
    async def test_execute_or_delegate_operator(
        self, do_execute_operator_mock, prepare_operator_executor_mock, ctx
    ):
        operator, _executor, inputs = (
            mock.MagicMock(),
            mock.Mock(),
            mock.Mock(),
        )

        def _execute(*args, **kwargs):
            self._assert(ctx.user_id, ctx.user_request_token, ctx.user_api_key)
            return mock.Mock()

        operator.resolve_execution_options.side_effect = _execute

        def _execute2(*args, **kwargs):
            assert ficv.running_user_id.get() == ctx.user_id
            assert (
                ficv.running_user_request_token.get() == ctx.user_request_token
            )
            return False

        operator.resolve_delegation.side_effect = _execute2

        prepare_operator_executor_mock.return_value = (
            operator,
            _executor,
            ctx,
            inputs,
        )

        #####
        result = await executor.execute_or_delegate_operator(
            "operator", "params", request_token=ctx.user_request_token
        )
        assert not result.error
        #####

        prepare_operator_executor_mock.assert_called_once_with(
            "operator", "params", request_token=ctx.user_request_token
        )
        do_execute_operator_mock.assert_called_once_with(
            operator, ctx, exhaust=False
        )

    @pytest.mark.asyncio
    @mock.patch.object(executor, "resolve_operation_user")
    async def test_resolve_type(self, resolve_operation_user_mock, ctx_user):
        user_dict = ctx_user.to_dict()
        user_dict.update(
            _request_token=ctx_user._request_token, _api_key=ctx_user._api_key
        )
        resolve_operation_user_mock.return_value = user_dict

        def _execute(*args, **kwargs):
            self._assert(
                ctx_user.id, ctx_user._request_token, ctx_user._api_key
            )

        operator_registry = mock.Mock()
        operator = operator_registry.get_operator.return_value
        operator.resolve_type.side_effect = _execute
        operator._plugin_secrets = None

        #####
        result = await executor.resolve_type(
            operator_registry,
            "operator",
            {"dataset_name": "dataset"},
            request_token=ctx_user._request_token,
            user="userid",
        )
        if isinstance(result, ExecutionResult):
            raise RuntimeError(result.error)
        #####

        resolve_operation_user_mock.assert_called_with(
            id="userid", dataset="dataset", token=ctx_user._request_token
        )
        operator.resolve_type.assert_called_once()

    @pytest.mark.asyncio
    @mock.patch.object(executor, "resolve_operation_user")
    async def test_resolve_execution_options(
        self, resolve_operation_user_mock, ctx_user
    ):
        user_dict = ctx_user.to_dict()
        user_dict.update(
            _request_token=ctx_user._request_token, _api_key=ctx_user._api_key
        )
        resolve_operation_user_mock.return_value = user_dict

        def _execute(*args, **kwargs):
            self._assert(
                ctx_user.id, ctx_user._request_token, ctx_user._api_key
            )
            return {}

        operator_registry = mock.Mock()
        operator = operator_registry.get_operator.return_value
        operator.resolve_execution_options.side_effect = _execute
        operator._plugin_secrets = None

        #####
        with mock.patch("fiftyone.operators.orchestrator.OrchestratorService"):
            result = await executor.resolve_execution_options(
                operator_registry,
                "operator",
                {"dataset_name": "dataset"},
                request_token=ctx_user._request_token,
                user="userid",
            )
            if isinstance(result, ExecutionResult):
                raise RuntimeError(result.error)

        #####

        resolve_operation_user_mock.assert_called_with(
            id="userid", dataset="dataset", token=ctx_user._request_token
        )
        operator.resolve_execution_options.assert_called_once()

    @mock.patch.object(executor, "resolve_operation_user")
    @pytest.mark.asyncio
    async def test_resolve_placement(
        self, resolve_operation_user_mock, ctx_user
    ):
        user_dict = ctx_user.to_dict()
        user_dict.update(
            _request_token=ctx_user._request_token, _api_key=ctx_user._api_key
        )
        resolve_operation_user_mock.return_value = user_dict

        def _execute(*args, **kwargs):
            self._assert(
                ctx_user.id, ctx_user._request_token, ctx_user._api_key
            )
            return {}

        operator = mock.Mock()
        operator.resolve_placement.side_effect = _execute

        #####
        result = await executor.resolve_placement(
            operator,
            {
                "dataset_name": "dataset",
            },
            request_token=ctx_user._request_token,
            user="userid",
        )
        if isinstance(result, ExecutionResult):
            raise RuntimeError(result.error)
        #####

        resolve_operation_user_mock.assert_called_with(
            id="userid", dataset="dataset", token=ctx_user._request_token
        )
        operator.resolve_placement.assert_called_once()
