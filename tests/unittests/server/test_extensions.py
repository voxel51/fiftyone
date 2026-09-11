"""
FiftyOne Server extensions unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace

from graphql import GraphQLError

from fiftyone.server.extensions import EndSession


def _run_operation(extension):
    hook = extension.on_operation()
    next(hook)
    try:
        next(hook)
    except StopIteration:
        pass


def _make_extension(errors):
    extension = EndSession.__new__(EndSession)
    extension.execution_context = SimpleNamespace(
        result=SimpleNamespace(errors=errors)
    )
    return extension


def _raised():
    try:
        raise ValueError("boom")
    except ValueError as e:
        return e


def test_end_session_attaches_stack_to_errors():
    original = _raised()
    error = GraphQLError("failed", original_error=original, path=["samples"])
    extension = _make_extension([error])

    _run_operation(extension)

    (transformed,) = extension.execution_context.result.errors
    assert transformed.message == "failed"
    assert transformed.path == ["samples"]
    assert transformed.original_error is original
    assert isinstance(transformed.extensions["stack"], list)


def test_end_session_leaves_successful_result_alone():
    extension = _make_extension(None)

    _run_operation(extension)

    assert extension.execution_context.result.errors is None
