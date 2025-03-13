"""
ODM package declaration.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import types

from .database import (
    aggregate,
    get_db_config,
    establish_db_conn,
    get_db_client,
    get_db_conn,
    get_async_db_client,
    get_async_db_conn,
    drop_database,
    sync_database,
    list_datasets,
    patch_saved_views,
    patch_annotation_runs,
    patch_brain_runs,
    patch_evaluations,
    patch_runs,
    delete_dataset,
    delete_saved_view,
    delete_saved_views,
    delete_evaluation,
    delete_evaluations,
    delete_brain_run,
    delete_brain_runs,
    delete_run,
    delete_runs,
    drop_collection,
    drop_orphan_collections,
    drop_orphan_saved_views,
    drop_orphan_runs,
    drop_orphan_stores,
    list_collections,
    get_collection_stats,
    stream_collection,
    count_documents,
    export_document,
    export_collection,
    import_document,
    import_collection,
    insert_documents,
    bulk_write,
)
from .dataset import (
    ActiveFields,
    SampleFieldDocument,
    ColorScheme,
    KeypointSkeleton,
    DatasetAppConfig,
    DatasetDocument,
    SidebarGroupDocument,
)
from .document import (
    Document,
    SerializableDocument,
)
from .embedded_document import (
    BaseEmbeddedDocument,
    DynamicEmbeddedDocument,
    DynamicEmbeddedDocumentException,
    EmbeddedDocument,
)
from .frame import (
    DatasetFrameDocument,
    NoDatasetFrameDocument,
)
from .mixins import get_default_fields
from .runs import RunDocument
from .sample import (
    DatasetSampleDocument,
    NoDatasetSampleDocument,
)
from .utils import (
    serialize_value,
    deserialize_value,
    validate_field_name,
    create_field,
    create_implied_field,
    get_field_kwargs,
    get_implied_field_kwargs,
    validate_fields_match,
)
from .views import SavedViewDocument

from .workspace import (
    default_workspace_factory,
    Panel,
    Space,
    WorkspaceDocument,
)

# This enables Sphinx refs to directly use paths imported here
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
