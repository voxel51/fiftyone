import typing as t
from dataclasses import asdict, dataclass, field
from datetime import datetime

import eta.core.utils as etau
from bson import ObjectId
from dacite import Config, from_dict
from pymongo.client_session import ClientSession

import fiftyone as fo
import fiftyone.constants as focn
import fiftyone.core.database as fod
import fiftyone.migrations as fomi

from .bson_schema import (
    BSONSchemaObjectProperty,
    as_bson_schemas,
    as_schema,
    commit_bson_schema,
    load_bson_schemas,
)
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
from .exceptions import FiftyOneDataError


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
                self.definition._id, session=session, virtual=True
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
                {"_id": self.definition._id},
                asdict(self.definition),
            )

    def delete(self) -> None:
        if not self.definition or not self.collections:
            raise FiftyOneDataError("reference has not dataset")

        db = fod.get_db_conn()
        for collection in self.collections.values():
            db.drop_collection(collection)

        db.datasets.delete_one({"_id": self.definition._id})
        self.bson_schemas = None
        self.collections = None
        self.definition = None

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

        schema = {"": Field(name="", type=root_document_cls)}
        schema.update(root_document_cls.__fiftyone_ref__.schema)
        with fod.get_db_client().start_session() as session, session.start_transaction():
            collections, field_definitions, bson_schemas = _set_collections(
                schema
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
                bson_schemas=bson_schemas,
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
        if not virtual and isinstance(name_or_id, ObjectId):
            raise FiftyOneDataError("invalid")

        if not virtual:
            fomi.migrate_dataset_if_necessary(name_or_id)

        db = fod.get_db_conn()
        filter = {"name" if isinstance(name_or_id, str) else "_id": name_or_id}
        definition = from_dict(
            DatasetDefinition,
            db.datasets.find_one(filter),
            config=Config(check_types=False),
        )

        collections = {
            d.path: d.collection
            for d in definition.fields
            if isinstance(d, DocumentFieldDefinition)
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
        type_definition = get_type_definition(field.type)
        cls = get_leaf_cls(type_definition)

        if issubclass(cls, Document):
            d = DocumentFieldDefinition(path, type_definition)
        else:
            d = FieldDefinition(path, type_definition)

        fields.append(d)

    return sorted(fields, key=lambda d: d.path)


def _set_collections(
    schema: t.Dict[str, Field]
) -> t.Tuple[
    t.Dict[str, str],
    t.List[t.Union[DocumentFieldDefinition, FieldDefinition]],
    t.Dict[str, BSONSchemaObjectProperty],
]:
    field_definitions = as_field_definitions(schema)
    documents = {
        d.path: get_leaf_cls(d.type)
        for d in field_definitions
        if isinstance(d, DocumentFieldDefinition)
    }
    collections: t.Dict[str, str] = {
        d.path: d.collection
        for d in field_definitions
        if isinstance(d, DocumentFieldDefinition)
    }
    collection_names = list(collections.values())
    bson_schemas = as_bson_schemas(list(collections), schema)

    db = fod.get_db_conn()
    exists = {
        c["name"]
        for c in db.command(
            {
                "listCollections": 1,
                "filter": {"name": {"$in": collection_names}},
            },
        )["cursor"]["firstBatch"]
    }

    for (path, cls), collection_name in zip(
        documents.items(), collections.values()
    ):
        if collection_name not in exists:
            db.create_collection(collection_name)
        collection = fod.get_db_conn()[collection_name]
        for index in cls.__fiftyone_indexes__:
            collection.create_index(index)

        commit_bson_schema(db, collection_name, bson_schemas[path])

    return collections, field_definitions, bson_schemas


def get_leaf_cls(
    d: t.Union[DictDefinition, ListDefinition, TupleDefinition, str],
) -> t.Union[t.Tuple[t.Type, ...], t.Type]:
    current: t.Union[
        DictDefinition, ListDefinition, TupleDefinition, str, None
    ] = d
    while not isinstance(current, (str, TupleDefinition)):
        if isinstance(current, DictDefinition):
            current = current.value

        elif isinstance(current, ListDefinition):
            current = current.type

    if current is None:
        return None

    if isinstance(current, str):
        return etau.get_class(current)

    return tuple(etau.get_class(t) for t in current.types)
