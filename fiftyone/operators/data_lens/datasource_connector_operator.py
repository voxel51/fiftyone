"""
FiftyOne Data Lens datasource connector.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import traceback
import uuid
from dataclasses import asdict

import fiftyone as fo
import fiftyone.core.storage as fos
import fiftyone.operators as foo
from fiftyone import ViewField as F
from fiftyone.core.odm.dataset import SampleFieldDocument
from fiftyone.operators.data_lens.models import (
    DataLensSearchResponse,
    PreviewResponse,
    ImportResponse,
    BaseResponse,
    PreviewRequest,
    ImportRequest,
    DatasourceConnectorRequest,
    RequestType,
)
from fiftyone.operators.data_lens.utils import filter_fields_for_type
from fiftyone.operators.executor import ExecutionResult


class DatasourceConnectorOperator(foo.Operator):
    """Operator which acts as the main entry point for Data Lens."""

    _MAX_IMPORT_SIZE = 1_000_000_000  # 1B seems like a reasonable limit...

    @property
    def config(self):
        return foo.OperatorConfig(
            name="lens_datasource_connector",
            label="Data Lens Datasource Connector",
            unlisted=True,
            allow_delegated_execution=True,
        )

    def execute(self, ctx: foo.ExecutionContext) -> dict:
        try:
            request = DatasourceConnectorRequest.from_dict(ctx.params)

            if request.request_type == RequestType.PREVIEW:
                return asdict(self._handle_preview(ctx))
            elif request.request_type == RequestType.IMPORT:
                return asdict(self._handle_import(ctx))
            else:
                raise ValueError(
                    f'unsupported query type "{request.request_type}"'
                )

        except Exception:
            return asdict(
                BaseResponse(
                    error=traceback.format_exc(),
                )
            )

    def _handle_preview(self, ctx: foo.ExecutionContext) -> PreviewResponse:
        try:
            preview_request = PreviewRequest(
                **filter_fields_for_type(ctx.params, PreviewRequest)
            )

            operator_result = self._execute_operator(
                preview_request.operator_uri, ctx
            )

            if operator_result.is_generator:
                operator_result = next(operator_result.result)
            else:
                operator_result = operator_result.result

            operator_response = DataLensSearchResponse(
                **filter_fields_for_type(
                    asdict(operator_result), DataLensSearchResponse
                )
            )

            # These samples are not being added to a dataset, so we need to
            #  manually resolve the URL for any cloud-backed media.
            for sample in operator_response.query_result:
                if "filepath" in sample:
                    sample["filepath"] = self._resolve_url(sample["filepath"])

            # We also need to generate a valid field schema for these samples
            #  to be rendered with their labels.
            field_schema = self._generate_schema(
                operator_response.query_result
            )

            return PreviewResponse(
                **filter_fields_for_type(
                    asdict(operator_response), PreviewResponse
                ),
                field_schema=field_schema,
            )

        except Exception:
            return PreviewResponse(
                error=traceback.format_exc(),
            )

    def _handle_import(self, ctx: foo.ExecutionContext) -> ImportResponse:
        try:
            import_request = ImportRequest(
                **filter_fields_for_type(ctx.params, ImportRequest)
            )

            dataset = self._load_dataset(import_request.dataset_name)

            operator_result = self._execute_operator(
                import_request.operator_uri, ctx
            )

            max_samples = (
                import_request.max_results
                if import_request.max_results > 0
                else self._MAX_IMPORT_SIZE
            )
            total_samples = 0

            if operator_result.is_generator:
                for batch_response in operator_result.result:
                    last_response = DataLensSearchResponse(
                        **filter_fields_for_type(
                            asdict(batch_response), DataLensSearchResponse
                        ),
                    )
                    if last_response.error is not None:
                        raise ValueError(last_response.error)

                    total_samples += self._import_samples(
                        dataset,
                        last_response.query_result,
                        import_request.tags,
                        max_samples - total_samples,
                        dedupe_samples=import_request.dedupe_samples,
                    )

                    if total_samples >= max_samples:
                        break

            else:
                last_response = DataLensSearchResponse(
                    **filter_fields_for_type(
                        asdict(operator_result.result), DataLensSearchResponse
                    ),
                )

                while total_samples < max_samples:
                    if last_response.error is not None:
                        raise ValueError(last_response.error)

                    total_samples += self._import_samples(
                        dataset,
                        last_response.query_result,
                        import_request.tags,
                        max_samples - total_samples,
                        dedupe_samples=import_request.dedupe_samples,
                    )

                    if total_samples >= max_samples:
                        break

                    pagination_token = last_response.pagination_token
                    if pagination_token is None:
                        break

                    operator_result = self._execute_operator(
                        import_request.operator_uri,
                        ctx,
                        {"pagination_token": pagination_token},
                    )

                    last_response = DataLensSearchResponse(
                        **filter_fields_for_type(
                            asdict(operator_result.result),
                            DataLensSearchResponse,
                        ),
                    )

            return ImportResponse()

        except Exception:
            return ImportResponse(
                error=traceback.format_exc(),
            )

    def _execute_operator(
        self,
        operator_uri: str,
        base_ctx: foo.ExecutionContext,
        ctx_overrides: dict = None,
    ) -> ExecutionResult:
        operator_ctx = self._build_ctx(base_ctx, ctx_overrides)
        operator_result = foo.execute_operator(
            operator_uri, operator_ctx, exhaust=False
        )
        operator_result.raise_exceptions()

        return operator_result

    def _import_samples(
        self,
        dataset: fo.Dataset,
        samples_json: list[dict],
        tags: list[str],
        max_samples: int,
        dedupe_samples: bool = False,
    ) -> int:
        samples = [fo.Sample.from_dict(s) for s in samples_json]

        self._add_sample_tags(samples, tags)

        if dedupe_samples:
            return self._merge_samples(dataset, samples, max_samples)

        else:
            dataset.add_samples(samples[:max_samples], progress=False)

            return min(len(samples), max_samples)

    def _build_ctx(
        self, base_ctx: foo.ExecutionContext, overrides: dict = None
    ) -> dict:
        return {
            "params": self._build_params(base_ctx, overrides),
        }

    @staticmethod
    def _load_dataset(name: str) -> fo.Dataset:
        if fo.dataset_exists(name):
            return fo.load_dataset(name)
        else:
            return fo.Dataset(name, persistent=True)

    @staticmethod
    def _merge_samples(
        dataset: fo.Dataset, samples: list[fo.Sample], max_samples: int
    ) -> int:
        unique_samples = DatasourceConnectorOperator._dedupe_samples(samples)

        new_filepaths = [s.filepath for s in unique_samples]
        existing_filepaths = set(
            dataset.match(F("filepath").is_in(new_filepaths)).values(
                "filepath"
            )
        )

        if existing_filepaths:
            unique_samples = [
                sample
                for sample in unique_samples
                if sample.filepath not in existing_filepaths
            ]

        dataset.add_samples(unique_samples[:max_samples], progress=False)

        return min(len(unique_samples), max_samples)

    @staticmethod
    def _add_sample_tags(
        samples: list[fo.Sample], tags: list[str]
    ) -> list[fo.Sample]:
        for sample in samples:
            sample_tags = sample.tags or []
            for tag in tags:
                if tag not in sample_tags:
                    sample_tags.append(tag)
            sample.tags = sample_tags

        return samples

    @staticmethod
    def _dedupe_samples(samples: list[fo.Sample]) -> list[fo.Sample]:
        unique_samples = []
        dedupe_keys = set()
        for sample in samples:
            if sample.filepath not in dedupe_keys:
                dedupe_keys.add(sample.filepath)
                unique_samples.append(sample)

        return unique_samples

    @staticmethod
    def _resolve_url(url: str) -> str:
        return fos.to_readable(url)

    @staticmethod
    def _build_params(
        ctx: foo.ExecutionContext, overrides: dict = None
    ) -> dict:
        source_params = ctx.params.copy()
        source_params.update(overrides or {})

        # Include all search parameters as top-level parameters.
        # This ensures that fields declared by `resolve_input` in the inner
        #  operator are accessible via `ctx.params.get(field_name)`.
        params = source_params.get("search_params", {}).copy()

        # Set metadata.
        # Note that these keys are meant to be treated as reserved and may
        #  overwrite user-defined values.
        params.update(
            {
                "_search_request": {
                    "search_params": source_params.get("search_params", {}),
                    "batch_size": source_params.get("batch_size", 100),
                    "max_results": source_params.get("max_results")
                    if source_params.get("max_results") > 0
                    else DatasourceConnectorOperator._MAX_IMPORT_SIZE,
                    "pagination_token": source_params.get("pagination_token"),
                },
            }
        )

        return params

    @staticmethod
    def _generate_schema(samples: list[dict]) -> dict:
        tmp_dataset = fo.Dataset(str(uuid.uuid4()))

        try:
            tmp_dataset.add_samples(
                [fo.Sample.from_dict(sample) for sample in samples],
                progress=False,
            )

            schema = tmp_dataset.get_field_schema()

            return {
                k: SampleFieldDocument.from_field(v).to_dict()
                for k, v in schema.items()
            }

        finally:
            tmp_dataset.delete()
