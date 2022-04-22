from dataclasses import asdict, dataclass, field
from datetime import datetime
import typing as t


from bson import ObjectId
from dacite import from_dict
import eta.core.utils as etau
from pymongo.client_session import ClientSession

import fiftyone as fo
import fiftyone.constants as focn

import fiftyone.migrations as fomi
import fiftyone.core.database as fod


from .bson_schema import (
    BSONSchemaObjectProperty,
    as_bson_schemas,
    as_schema,
    commit_bson_schema,
    load_bson_schemas,
)
from .exceptions import FiftyOneDataError
from .datafield import Field
from .definitions import (
    DatasetDefinition,
    DictDefinition,
    DocumentFieldDefinition,
    FieldDefinition,
    ListDefinition,
    MediaType,
    TupleDefinition,
    get_type_definition,
)


@dataclass
class FiftyOneReference:
    bson_schemas: t.Optional[t.Dict[str, BSONSchemaObjectProperty]] = None
    collections: t.Optional[t.Dict[str, str]] = None
    definition: t.Optional[DatasetDefinition] = None
    schema: t.Dict[str, Field] = field(default_factory=dict)

    @property
    def expanded(self) -> bool:
        if not self.definition:
            raise FiftyOneDataError("reference not in db")

        return len(self.schema) > len(self.definition.fields)

    @property
    def in_db(self) -> bool:
        return self.definition is not None

    def commit(self) -> None:
        client = fod.get_db_client()
        db = fod.get_db_conn()
        if not self.definition or not self.bson_schemas:
            raise FiftyOneDataError("reference has not dataset")

        with client.start_session() as session, session.start_transaction():
            latest = self.__class__.from_db(
                self.definition.id, session=session, virtual=True
            )

            original_schema = as_schema(
                self.definition.fields, self.bson_schemas
            )

            added_paths = set(self.schema).difference(original_schema)
            for path in added_paths:  # todo: strict field comparisons
                latest.schema[path] = self.schema[path]

            deleted_paths = set(original_schema).difference(self.schema)
            for path in deleted_paths:  # todo: strict field comparisons
                del latest.schema[path]

            collections, field_definitions, bson_schemas = _set_collections(
                latest.schema
            )
            self.collections = collections
            self.definition.fields = field_definitions
            self.bson_schemas = bson_schemas

            db.datasets.replace_one(
                {"_id": self.definition.id}, asdict(self.definition)
            )

    def clone(self) -> "FiftyOneReference":
        pass

    @classmethod
    def create(
        self,
        name: str,
        root_document_cls: t.Type["fo.Document"],
        media_type: t.Optional[MediaType] = None,
        persistent: bool = False,
    ) -> "FiftyOneReference":

        if self.exists(name):
            raise ValueError(
                (
                    "Dataset '%s' already exists; use `fiftyone.load_dataset()` "
                    "to load an existing dataset"
                )
                % name
            )

        with fod.get_db_client().start_session() as session, session.start_transaction():
            collections, field_definitions, bson_schemas = _set_collections(
                root_document_cls.__fiftyone_ref__.schema, session
            )
            schema = as_schema(field_definitions, bson_schemas)

            now = datetime.utcnow()
            definition = DatasetDefinition(
                name=name,
                created_at=now,
                fields=field_definitions,
                last_loaded_at=now,
                media_type=media_type,
                persistent=persistent,
                root=True,
                version=focn.VERSION,
            )

            fod.get_db_conn().datasets.insert_one(asdict(definition))

            return FiftyOneReference(
                bson_schema=bson_schemas,
                collections=collections,
                definition=definition,
                schema=schema,
            )

    @classmethod
    def from_db(
        cls,
        name_or_id: t.Union[str, ObjectId],
        session: t.Optional[ClientSession] = None,
        virtual: bool = False,
    ) -> "FiftyOneReference":
        if virtual and (session or isinstance(name_or_id, ObjectId)):
            raise FiftyOneDataError("invalid")

        if not virtual:
            fomi.migrate_dataset_if_necessary(name_or_id)

        db = fod.get_db_conn()
        filter = {"name" if isinstance(name_or_id, str) else "_id": name_or_id}
        definition = from_dict(
            DatasetDefinition,
            db.datasets.find_one(filter, session=session),
        )

        collections = {
            p: d.collection
            for p, d in _get_document_definitions(definition.fields).items()
        }
        bson_schemas = load_bson_schemas(db, collections)
        schema = as_schema(definition.fields, bson_schemas)

        ref = FiftyOneReference(
            bson_schemas=bson_schemas,
            collections=collections,
            definition=definition,
            schema=schema,
        )

        if not virtual:
            definition.last_loaded_at = datetime.utcnow()
            ref.commit()

        return ref

    @staticmethod
    def exists(name: str) -> bool:
        db = fod.get_db_conn()
        return bool(db.datasets.find_one({"name": name}, {"_id": 1}))


def as_field_definitions(
    schema: t.Dict[str, Field]
) -> t.List[t.Union[DocumentFieldDefinition, FieldDefinition]]:
    from .document import Document

    fields: t.List[t.Union[DocumentFieldDefinition, FieldDefinition]] = []
    for path, field in schema.items():
        if not field.type:
            raise FiftyOneDataError(f"field {field.name} has no type")

        d: t.Union[DocumentFieldDefinition, FieldDefinition]
        type = get_type_definition(field.type)
        if issubclass(field.type, Document):
            d = DocumentFieldDefinition(path, type)
        else:
            d = FieldDefinition(path, type)

        fields.append(d)

    return sorted(fields, key=lambda d: d.path)


def _set_collections(
    schema: t.Dict[str, Field], session: ClientSession
) -> t.Tuple[
    t.Dict[str, str],
    t.List[t.Union[DocumentFieldDefinition, FieldDefinition]],
    t.Dict[str, BSONSchemaObjectProperty],
]:
    field_definitions = as_field_definitions(schema)
    bson_schemas = as_bson_schemas(schema)

    documents = _get_document_definitions(
        field_definitions, paths=bson_schemas
    )
    collections: t.Dict[str, str] = {}
    collection_names = [d.collection for d in documents.values()]

    db = fod.get_db_conn()
    exists = {
        c["name"]
        for c in db.command(
            {
                "listCollections": 1,
                "filter": {"name": {"$in": collection_names}},
            },
            session=session,
        )["cursor"]["firstBatch"]
    }

    for path, field_definition in documents.items():
        cls = etau.get_class(field_definition.type)

        if field_definition.collection not in exists:
            db.create_collection(field_definition.collection)
        collection = fod.get_db_conn()[field_definition.collection]
        collections[field_definition.path] = field_definition.collection

        for index in cls.__fiftyone_indexes__:
            collection.create_index(index, session=session)

        commit_bson_schema(
            db, field_definition.collection, bson_schemas[path], session
        )

    return collections, field_definitions, bson_schemas


def _get_document_definitions(
    field_definitions: t.List[
        t.Union[DocumentFieldDefinition, FieldDefinition]
    ],
    paths: t.Iterable[str] = None,
) -> t.Dict[str, DocumentFieldDefinition]:
    field_definitions_dict = {d.path: d for d in field_definitions}
    documents: t.Dict[str, DocumentFieldDefinition] = {}
    if not paths:
        paths = field_definitions_dict

    for path in paths:
        field_definition: t.Union[
            DocumentFieldDefinition,
            FieldDefinition,
            DictDefinition,
            ListDefinition,
            str,
            TupleDefinition,
            None,
        ] = field_definitions_dict[path]
        while not isinstance(field_definition, DocumentFieldDefinition):
            if isinstance(field_definition, DictDefinition):
                field_definition = field_definition.value

            elif isinstance(field_definition, ListDefinition):
                field_definition = field_definition.type
            else:
                break

        if not isinstance(field_definition, DocumentFieldDefinition):
            raise FiftyOneDataError("unexpected")

        documents[path] = field_definition

    return documents
