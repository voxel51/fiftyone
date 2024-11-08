"""
FiftyOne Data Lens operator.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import Generator

import fiftyone.operators as foo
from fiftyone.operators.data_lens.models import DataLensSearchRequest, DataLensSearchResponse
from fiftyone.operators.data_lens.utils import filter_fields_for_type


class DataLensOperator(foo.Operator):
    """Base class for operators which are compatible with Data Lens."""

    def execute(self, ctx: foo.ExecutionContext) -> Generator[DataLensSearchResponse, None, None]:
        request = self.build_request(ctx)

        for batch_response in self.handle_lens_search_request(request, ctx):
            yield batch_response

    def handle_lens_search_request(
            self,
            request: DataLensSearchRequest,
            ctx: foo.ExecutionContext,
    ) -> Generator[DataLensSearchResponse, None, None]:
        """Handle a Data Lens search request.

        Args:
            request: a Data Lens search request.
            ctx: Operator execution context.

        Returns:
            Generator[DataLensSearchResponse, None, None]: Generator which yields search responses.
        """
        raise NotImplementedError()

    @staticmethod
    def build_request(ctx: foo.ExecutionContext) -> DataLensSearchRequest:
        """Build a :class:`DataLensSearchRequest` object from the given context.

        Args:
            ctx: Execution context.

        Returns:
            :class:`DataLensSearchRequest` instance.
        """
        return DataLensSearchRequest(
            **filter_fields_for_type(ctx.params.get('_search_request', {}), DataLensSearchRequest)
        )
