"""
FiftyOne Data Lens models.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import enum
from dataclasses import dataclass, field

from fiftyone.operators.data_lens.utils import filter_fields_for_type


@dataclass
class BaseResponse:
    """Base class for responses."""
    error: str = None


@dataclass
class DataLensSearchRequest:
    """Request model representing a Data Lens search."""
    search_params: dict
    batch_size: int
    max_results: int
    pagination_token: str = None


@dataclass
class DataLensSearchResponse(BaseResponse):
    """Response model representing Data Lens search results."""
    result_count: int = 0
    query_result: list[dict] = field(default_factory=list)
    pagination_token: str = None


@dataclass
class PreviewResponse(BaseResponse):
    """Response model containing the data required for sample preview."""
    result_count: int = 0
    query_result: list[dict] = field(default_factory=list)
    field_schema: dict = None


class RequestType(enum.Enum):
    """Datasource connector request types."""
    PREVIEW = 'preview'
    IMPORT = 'import'


@dataclass
class DatasourceConnectorRequest:
    """Base request model for entry into the datasource connector operator."""
    request_type: RequestType

    @classmethod
    def from_dict(cls, data: dict) -> 'DatasourceConnectorRequest':
        request_type_str = data.get('request_type', '').upper()
        try:
            request_type = RequestType[request_type_str]
        except KeyError:
            raise ValueError(f'Unsupported request type {request_type_str}')

        kwargs = data.copy()
        kwargs['request_type'] = request_type

        return cls(
            **filter_fields_for_type(kwargs, cls)
        )


@dataclass
class PreviewRequest:
    """Request model for fetching data to generate a sample preview."""
    search_params: dict
    operator_uri: str
    max_results: int


@dataclass
class ImportRequest:
    """Request model for importing samples into a dataset."""
    search_params: dict
    operator_uri: str
    batch_size: int
    dataset_name: str
    max_samples: int = 0
    tags: list[str] = field(default_factory=list)


@dataclass
class ImportResponse(BaseResponse):
    """Response model for sample import."""
    import_id: str = None


@dataclass
class LensConfig:
    """Data model representing a lens configuration."""
    id: str
    name: str
    operator_uri: str


@dataclass
class ListConfigsRequest:
    """Request model for listing lens configurations."""
    pass

@dataclass
class ListConfigsResponse(BaseResponse):
    """Response model for listing lens configurations."""
    configs: list[dict] = field(default_factory=list)


@dataclass
class UpsertConfigRequest:
    """Request model for upserting a lens configuration."""
    name: str
    operator_uri: str
    id: str = None


@dataclass
class UpsertConfigResponse(BaseResponse):
    """Response model for upserting a lens configuration."""
    config: dict = field(default_factory=dict)


@dataclass
class DeleteConfigRequest:
    """Request model for deleting a lens configuration."""
    id: str


@dataclass
class DeleteConfigResponse(BaseResponse):
    """Response model for deleting a lens configuration."""
    pass
