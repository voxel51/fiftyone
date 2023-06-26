"""
FiftyOne Server context

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from contextlib import suppress
from dataclasses import asdict, dataclass
import json
import typing as t

import asyncio
from graphql import GraphQLError, GraphQLFormattedError, parse
from graphql.error.graphql_error import format_error as format_graphql_error
import starlette.requests as strq
import starlette.responses as strp
from strawberry import UNSET
import strawberry.asgi as gqla
from strawberry.http import GraphQLRequestData
from strawberry.http.base import BaseRequestProtocol
from strawberry.http.exceptions import HTTPException
from strawberry.http.typevars import RootValue
from strawberry.schema import BaseSchema
from strawberry.types import ExecutionResult
from strawberry.types.graphql import OperationType
from strawberry.utils.debug import pretty_print_graphql_operation
from strawberry.utils.operation import get_operation_type

import fiftyone as fo
from fiftyone.core.odm import get_async_db_client

from fiftyone.server.data import Context
from fiftyone.server.dataloader import dataloaders, get_dataloader


_subscriptions: t.Dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)
_operations: t.Dict[str, "Operation"] = {}


class GraphQL(gqla.GraphQL):
    def should_render_graphiql(self, request: BaseRequestProtocol) -> bool:
        return (
            super().should_render_graphiql(request)
            and "subscription" not in request.query_params
        )

    async def execute_operation(
        self,
        request: strq.Request,
        context: Context,
        root_value: t.Optional[RootValue],
    ) -> ExecutionResult:
        request_adapter = self.request_adapter_class(request)

        subscription = request_adapter.query_params.get("subscription", None)
        if request_adapter.method == "GET" and subscription:
            messages = []
            while True:
                try:
                    messages.append(
                        asdict(_subscriptions[subscription].get_nowait())
                    )
                except asyncio.QueueEmpty:
                    break

            return ExecutionResult(data={"messages": messages}, errors=[])

        try:
            request_data = await self.parse_http_body(request_adapter)
        except json.decoder.JSONDecodeError as e:
            raise HTTPException(
                400, "Unable to parse request body as JSON"
            ) from e
            # DO this only when doing files
        except KeyError as e:
            raise HTTPException(400, "File(s) missing in form data") from e

        allowed_operation_types = OperationType.from_http(
            request_adapter.method
        )

        if not self.allow_queries_via_get and request_adapter.method == "GET":
            allowed_operation_types = allowed_operation_types - {
                OperationType.QUERY
            }

        assert self.schema

        if (
            subscription
            and get_operation_type(
                parse(request_data.query), request_data.operation_name
            )
            == OperationType.SUBSCRIPTION
        ):
            return await self._handle_subscribe(
                subscription,
                request.query_params["operation"],
                context,
                request_data,
                root_value,
                self.schema,
                self.debug,
            )

        return await self.schema.execute(
            request_data.query,
            root_value=root_value,
            variable_values=request_data.variables,
            context_value=context,
            operation_name=request_data.operation_name,
            allowed_operation_types=allowed_operation_types,
        )

    async def get_context(
        self, request: strq.Request, response: strp.Response
    ) -> Context:
        db_client = get_async_db_client()
        db = db_client[fo.config.database_name]
        session = await db_client.start_session()
        loaders = {}
        for cls, config in dataloaders.items():
            loaders[cls] = get_dataloader(cls, config, db, session)

        return Context(
            db=db,
            session=session,
            dataloaders=loaders,
            request=request,
            response=response,
        )

    async def _handle_async_results(
        self,
        result_source: t.AsyncGenerator,
        operation: "Operation",
    ) -> None:
        try:
            async for result in result_source:
                if result.errors:
                    error_payload = [
                        format_graphql_error(err) for err in result.errors
                    ]
                    error_message = ErrorMessage(
                        id=operation.id, payload=error_payload
                    )
                    await operation.send_message(error_message)
                    self.schema.process_errors(result.errors)
                    return
                else:
                    next_payload = {"data": result.data}
                    next_message = NextMessage(
                        id=operation.id, payload=next_payload
                    )
                    await operation.send_message(next_message)
        except asyncio.CancelledError:
            # CancelledErrors are expected during task cleanup.
            raise
        except Exception as error:
            # GraphQLErrors are handled by graphql-core and included in the
            # ExecutionResult
            error = GraphQLError(str(error), original_error=error)
            error_payload = [format_graphql_error(error)]
            error_message = ErrorMessage(
                id=operation.id, payload=error_payload
            )
            await operation.send_message(error_message)
            self.schema.process_errors([error])
            return

    async def _handle_subscribe(
        self,
        id: str,
        operation_id: str,
        context: Context,
        request_data: GraphQLRequestData,
        root_value: t.Optional[RootValue],
        schema: BaseSchema,
        debug=False,
    ):
        if debug:
            pretty_print_graphql_operation(
                request_data.operation_name,
                request_data.query,
                request_data.variables,
            )

        result_source = await schema.subscribe(
            query=request_data.query,
            variable_values=request_data.variables,
            operation_name=request_data.operation_name,
            context_value=context,
            root_value=root_value,
        )

        if isinstance(result_source, ExecutionResult):
            schema.process_errors(result_source.errors)
            return result_source

        operation = Operation(id, operation_id)
        operation.task = asyncio.create_task(
            self._operation_task(result_source, operation)
        )
        _operations[operation_id] = operation

        return ExecutionResult(data={}, errors=[])

    async def _operation_task(
        self, result_source: t.AsyncGenerator, operation: Operation
    ) -> None:
        try:
            await self._handle_async_results(result_source, operation)
        except BaseException:  # pragma: no cover
            # cleanup in case of something really unexpected
            # wait for generator to be closed to ensure that any existing
            # 'finally' statement is called
            with suppress(RuntimeError):
                await result_source.aclose()

            _operations.pop(operation.id)
            raise
        else:
            await operation.send_message(CompleteMessage(id=operation.id))
        finally:
            return
            # add this task to a list to be reaped later
            """
            task = asyncio.current_task()
            assert task is not None
            self.completed_tasks.append(task)
            """


@dataclass
class GraphQLTransportMessage:
    def as_dict(self) -> dict:
        data = asdict(self)
        if getattr(self, "payload", None) is UNSET:
            # Unset fields must have a JSON value of "undefined" not "null"
            data.pop("payload")
        return data


class Operation:
    __slots__ = ["id", "completed", "subscription_id", "task"]

    def __init__(self, subscription_id: str, id: str):
        self.id = id
        self.subscription_id = subscription_id
        self.completed = False
        self.task: t.Optional[asyncio.Task] = None

    async def send_message(self, message: GraphQLTransportMessage) -> None:
        if self.completed:
            return
        if isinstance(message, (CompleteMessage, ErrorMessage)):
            self.completed = True
            # de-register the operation _before_ sending the final message
            _operations.pop(self.id)

        _subscriptions[self.subscription_id].put_nowait(message)


@dataclass
class NextMessage(GraphQLTransportMessage):
    id: str
    payload: t.Dict[str, t.Any]  # TODO: shape like ExecutionResult
    type: str = "next"

    def as_dict(self) -> dict:
        return {"id": self.id, "payload": self.payload, "type": self.type}


@dataclass
class ErrorMessage(GraphQLTransportMessage):
    id: str
    payload: t.List[GraphQLFormattedError]
    type: str = "error"


@dataclass
class CompleteMessage(GraphQLTransportMessage):
    id: str
    type: str = "complete"
