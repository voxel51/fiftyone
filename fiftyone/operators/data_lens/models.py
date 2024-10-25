"""
FiftyOne Data Lens models.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import enum
from dataclasses import dataclass, KW_ONLY, field


@dataclass
class BaseResponse:
    """Base class for responses."""
    _: KW_ONLY
    error: str = None


@dataclass
class DataLensSearchRequest:
    """Request model representing a Data Lens search."""
    _: KW_ONLY
    search_params: dict
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
    _: KW_ONLY
    request_type: str


@dataclass
class PreviewRequest:
    """Request model for fetching data to generate a sample preview."""
    _: KW_ONLY
    search_params: dict
    operator_uri: str
    max_results: int


@dataclass
class ImportRequest:
    """Request model for importing samples into a dataset."""
    _: KW_ONLY
    search_params: dict
    operator_uri: str
    batch_size: int
    dataset_name: str
    max_samples: int = 0


@dataclass
class ImportResponse(BaseResponse):
    """Response model for sample import."""
    import_id: str = None


@dataclass
class LensConfig:
    """Data model representing a lens configuration."""
    _: KW_ONLY
    id: str
    name: str
    operator_uri: str


@dataclass
class ListConfigsRequest:
    """Request model for listing lens configurations."""
    _: KW_ONLY


@dataclass
class ListConfigsResponse(BaseResponse):
    """Response model for listing lens configurations."""
    configs: list[dict] = field(default_factory=list)


@dataclass
class UpsertConfigRequest:
    """Request model for upserting a lens configuration."""
    _: KW_ONLY
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
    _: KW_ONLY
    id: str


@dataclass
class DeleteConfigResponse(BaseResponse):
    """Response model for deleting a lens configuration."""
    pass
