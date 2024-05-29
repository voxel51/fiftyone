import typing as t

import strawberry as gql

from fiftyone.server.context import get_context


async def execute(schema: gql.Schema, query: str, variables: t.Dict):
    """Execute a test GraphQL query.

    Args:
        schema: a :class:`strawberry.Schema`
        query: a GraphQL query string
        variables: a variables dictionary

    Returns:
        an :class:`strawberry.types.execution.ExecutionResult`
    """
    return await schema.execute(
        query,
        variable_values=variables,
        context_value=get_context(use_global_db_client=False),
    )
