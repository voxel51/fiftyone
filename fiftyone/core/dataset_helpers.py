
import fiftyone.core.odm as foo
from datetime import datetime
import fiftyone.core.fields as fof


def _set_field_read_only(field_doc, read_only):
    field_doc.read_only = read_only
    if hasattr(field_doc, "fields"):
        for _field_doc in field_doc.fields:
            _set_field_read_only(_field_doc, read_only)


def _create_sample_document_cls(
    dataset, sample_collection_name, reference, field_docs=None
):
    if reference:
        cls = type(sample_collection_name, (foo.DatasetSampleReferenceDocument,), {})
        cls._dataset = dataset

        name = reference.name

        db = foo.get_db_conn()
        res = db.datasets.find_one({"name": name})
        if not res:
            raise Exception(name)

        dataset_doc = foo.DatasetDocument.from_dict(res)

        sample_collection_name = dataset_doc.sample_collection_name

        for d in dataset_doc.sample_fields:
            _set_field_read_only(d, True)

        cls._sample_id.document_type_obj = _create_sample_document_cls(reference, reference._sample_collection_name, None, field_docs=dataset_doc.sample_fields)
    else:
        cls = type(sample_collection_name, (foo.DatasetSampleDocument,), {})
        cls._dataset = dataset
        _declare_fields(dataset, cls, field_docs=field_docs)

    return cls


def _create_frame_document_cls(
    dataset, frame_collection_name, field_docs=None
):
    cls = type(frame_collection_name, (foo.DatasetFrameDocument,), {})
    cls._dataset = dataset

    _declare_fields(dataset, cls, field_docs=field_docs)
    return cls


def _declare_fields(dataset, doc_cls, field_docs=None):
    default_fields = set(doc_cls._fields.keys())
    if field_docs is not None:
        default_fields -= {field_doc.name for field_doc in field_docs}

    # Declare default fields that don't already exist
    now = datetime.utcnow()
    for field_name in default_fields:
        field = doc_cls._fields[field_name]

        if isinstance(field, fof.EmbeddedDocumentField):
            field = foo.create_field(field_name, **foo.get_field_kwargs(field))
        else:
            field = field.copy()

        field._set_created_at(now)
        doc_cls._declare_field(dataset, field_name, field)

    # Declare existing fields
    if field_docs is not None:
        for field_doc in field_docs:
            doc_cls._declare_field(dataset, field_doc.name, field_doc)
