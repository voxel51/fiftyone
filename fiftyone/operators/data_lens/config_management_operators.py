"""
FiftyOne Data Lens configuration management operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict

import fiftyone.operators as foo
from fiftyone.operators.data_lens.config_manager import ConfigManager
from fiftyone.operators.data_lens.models import (
    UpsertConfigRequest, DeleteConfigRequest, ListConfigsResponse, LensConfig, UpsertConfigResponse,
    DeleteConfigResponse
)
from fiftyone.operators.data_lens.utils import filter_fields_for_type


class ListLensConfigsOperator(foo.Operator):
    """Operator which provides capability to list existing Lens configurations."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name='lens_list_lens_configs',
            label='List Data Lens Configs',
            unlisted=True,
        )

    def execute(self, ctx):
        try:
            configs = ConfigManager().list_configs()

            return asdict(
                ListConfigsResponse(
                    configs=[
                        asdict(config)
                        for config in configs
                    ],
                )
            )

        except Exception as e:
            return asdict(
                ListConfigsResponse(
                    error=str(e),
                )
            )


class UpsertLensConfigOperator(foo.Operator):
    """Operator which provides capability to upsert Lens configurations."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name='lens_upsert_lens_config',
            label='Upsert Data Lens Config',
            unlisted=True,
        )

    def execute(self, ctx):
        try:
            request = UpsertConfigRequest(
                **filter_fields_for_type(ctx.params, UpsertConfigRequest)
            )

            config = LensConfig(
                id=request.id,
                name=request.name,
                operator_uri=request.operator_uri,
            )

            updated = ConfigManager().upsert_config(config)

            return asdict(
                UpsertConfigResponse(
                    config=asdict(updated),
                )
            )

        except Exception as e:
            return asdict(
                UpsertConfigResponse(
                    error=str(e),
                )
            )


class DeleteLensConfigOperator(foo.Operator):
    """Operator which provides capability to delete Lens configurations."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name='lens_delete_lens_config',
            label='Delete Data Lens Config',
            unlisted=True,
        )

    def execute(self, ctx):
        try:
            request = DeleteConfigRequest(
                **filter_fields_for_type(ctx.params, DeleteConfigRequest)
            )

            ConfigManager().delete_config(request.id)

            return asdict(
                DeleteConfigResponse()
            )

        except Exception as e:
            return asdict(
                DeleteConfigResponse(
                    error=str(e),
                )
            )
