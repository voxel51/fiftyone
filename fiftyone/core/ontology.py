"""
Ontology classes for defining reusable annotation and taxonomy structures.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import copy
import fnmatch
from datetime import datetime
from typing import Any, ClassVar, NamedTuple, Optional

import fiftyone.core.annotation.constants as foac
import fiftyone.core.utils as fou
from fiftyone.core.annotation.attributes import (
    AttributeSpec,
    attr_insert_to_dict,
)
from fiftyone.core.annotation.nodes import Node
from fiftyone.core.odm.ontology import OntologyDocument, OntologyType


class Ontology(abc.ABC):
    """Abstract base class for ontology types.

    Ontologies are global, named, versioned resources that define reusable
    annotation structures. They are not scoped to any single dataset.
    ``save()`` and ``load()`` populate :attr:`version`,
    :attr:`created_at`, and :attr:`last_modified_at`.

    Args:
        name: the ontology name
        description: optional description
    """

    _TYPE: ClassVar[Optional[str]] = None

    def _validate(self) -> None:
        """Hook called by :meth:`save` to validate the ontology before
        persisting. Default is a no-op; subclasses override to call
        their type-specific validator.
        """

    def __init__(
        self,
        name: str,
        description: Optional[str] = None,
    ):
        if name is None:
            raise ValueError("Ontology name is required")
        self.name = name.strip()
        if not self.name:
            raise ValueError("Ontology name cannot be empty")
        self.description = description
        # Backing ``OntologyDocument`` once persisted; ``None`` until then.
        self._doc = None

    @property
    def version(self) -> Optional[int]:
        """The version of this ontology, or ``None`` if not yet saved."""
        if self._doc is not None:
            return self._doc.version

        return None

    @property
    def created_at(self) -> Optional[datetime]:
        """The datetime this ontology was created, or ``None`` if not yet
        saved.
        """
        if self._doc is not None:
            return self._doc.created_at

        return None

    @property
    def last_modified_at(self) -> Optional[datetime]:
        """The datetime this ontology was last modified, or ``None`` if not
        yet saved.
        """
        if self._doc is not None:
            return self._doc.last_modified_at

        return None

    @property
    def is_annotation_ontology(self) -> bool:
        """Whether this ontology is an annotation ontology."""
        return self._TYPE == OntologyType.ANNOTATION_ONTOLOGY.value

    @property
    def is_taxonomy(self) -> bool:
        """Whether this ontology is a taxonomy."""
        return self._TYPE == OntologyType.TAXONOMY.value

    def save(self, overwrite: bool = False) -> None:
        """Saves this ontology to the database.

        Args:
            overwrite: if True and an ontology with this name already exists
                in the database, adopt its lineage and append a new version.
                Enables JSON/git-driven workflows where an instance built via
                :meth:`from_dict` is saved without first calling
                :func:`load_ontology`. With the default ``False``, saving an
                in-memory instance whose slug collides with a persisted
                ontology is rejected.
        """
        self._validate()
        if self._doc is None and overwrite:
            self._doc = self._find_latest_doc()

        if self._doc is None:
            self._doc = OntologyDocument(
                name=self.name,
                type=self._TYPE,
                description=self.description,
                root=self._get_root(),
            )
        else:
            self._doc.name = self.name
            self._doc.description = self.description
            self._doc.root = self._get_root()

        self._doc.save()

    def _find_latest_doc(self) -> Optional[OntologyDocument]:
        slug = fou.to_slug(self.name)
        return (
            OntologyDocument.objects(slug=slug, type=self._TYPE)
            .order_by("-version")
            .first()
        )

    def reload(self) -> None:
        """Reloads this ontology from the database."""
        if self._doc is None:
            raise ValueError(
                "Cannot reload an ontology that has not been saved"
            )

        self._doc.reload()
        self._apply_doc(self._doc)

    def delete(self) -> None:
        """Deletes this ontology from the database."""
        if self._doc is None:
            raise ValueError(
                "Cannot delete an ontology that has not been saved"
            )

        self._doc.delete()
        self._doc = None

    def clone(self, new_name: str) -> "Ontology":
        """Clones this ontology under a new name.

        Args:
            new_name: the name for the clone

        Returns:
            the cloned :class:`Ontology`
        """
        cloned = copy.deepcopy(self)
        cloned.name = new_name
        cloned._doc = None
        cloned.save()
        return cloned

    def _get_root(self) -> Any:
        """Returns the serialized root data for storage.

        Subclasses must implement this.
        """
        raise NotImplementedError

    def _apply_doc(self, doc: OntologyDocument) -> None:
        """Hydrates this instance from a loaded document.

        Subclasses must implement this.
        """
        raise NotImplementedError

    def to_dict(self) -> dict:
        """Serializes this ontology to a dict.

        Returns:
            a dict
        """
        d: dict[str, Any] = {
            "name": self.name,
            "type": self._TYPE,
        }
        for attr in (
            "description",
            "version",
            "created_at",
            "last_modified_at",
        ):
            attr_insert_to_dict(d, attr, self)
        return d

    @classmethod
    @abc.abstractmethod
    def from_dict(cls, d: dict) -> "Ontology":
        """Creates an ontology from a dict.

        Args:
            d: an ontology dict

        Returns:
            an :class:`Ontology`
        """

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"name={self.name!r}, version={self.version})"
        )


class AnnotationOntology(Ontology):
    """Ontology for defining annotation structures.

    Bundles typed attributes (with optional conditional display logic) and
    an optional taxonomy reference into a single document that gets
    connected to a label schema on a field.

    Args:
        name: the ontology name
        description: optional description
        taxonomy: optional :class:`Taxonomy` instance to bundle with this
            ontology. Stored internally as the taxonomy's slug.
        attributes: list of :class:`AttributeSpec` instances

    Example::

        vehicle_classes = Taxonomy(
            name="vehicle_classes",
            root=Node(name="root", values=[Node(name="car")]),
        )
        AnnotationOntology(
            name="vehicle_damage_ontology",
            description="Vehicle damage annotation",
            taxonomy=vehicle_classes,
            attributes=[
                AttributeSpec(
                    name="damage_present",
                    type="bool",
                    component="checkbox",
                ),
                AttributeSpec(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear", "driver_side", "passenger_side"],
                    when=WhenEquals(field="damage_present", value=True),
                ),
            ],
        )
    """

    _TYPE = OntologyType.ANNOTATION_ONTOLOGY.value

    def __init__(
        self,
        name: str,
        description: Optional[str] = None,
        taxonomy: Optional["Taxonomy"] = None,
        attributes: Optional[list[AttributeSpec]] = None,
    ):
        super().__init__(name=name, description=description)
        self.taxonomy = self._extract_taxonomy_slug(taxonomy)
        self.attributes = attributes or []

    @staticmethod
    def _extract_taxonomy_slug(
        taxonomy: Optional["Taxonomy"],
    ) -> Optional[str]:
        if taxonomy is None:
            return None
        if not isinstance(taxonomy, Taxonomy):
            raise TypeError(
                f"taxonomy must be a Taxonomy instance, got "
                f"{type(taxonomy).__name__}"
            )
        return fou.to_slug(taxonomy.name)

    def _validate(self) -> None:
        # Lazy import — ``ontology_validation`` imports
        # ``AnnotationOntology`` for type hints, so a top-level import
        # here would be circular.
        from fiftyone.core.ontology_validation import (
            validate_annotation_ontology,
        )

        validate_annotation_ontology(self)

    def _get_root(self) -> dict:
        return {
            "taxonomy": self.taxonomy,
            "attributes": [attr.to_dict() for attr in self.attributes],
        }

    def _apply_doc(self, doc: OntologyDocument) -> None:
        self.name = doc.name
        self.description = doc.description
        self.taxonomy = doc.root.get("taxonomy")
        self.attributes = [
            AttributeSpec.from_dict(a) for a in doc.root.get("attributes", [])
        ]

    def to_dict(self) -> dict:
        """Serializes this annotation ontology to a dict.

        Returns:
            a dict
        """
        d = super().to_dict()
        d["root"] = self._get_root()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "AnnotationOntology":
        """Creates an :class:`AnnotationOntology` from a dict.

        Args:
            d: an annotation ontology dict

        Returns:
            an :class:`AnnotationOntology`
        """
        root = d.get("root") or {}
        ao = cls(
            name=d["name"],
            description=d.get("description"),
            attributes=[
                AttributeSpec.from_dict(a) for a in root.get("attributes", [])
            ],
        )
        # Dict stores the already-resolved slug; assign past the
        # Taxonomy-instance type check at construction.
        ao.taxonomy = root.get("taxonomy")
        return ao


class Taxonomy(Ontology):
    """Ontology for defining a hierarchical class structure.

    A taxonomy is a named, versioned, self-contained class hierarchy.
    Label schema fields reference a taxonomy by ``name`` instead of
    inlining a flat class list, so the same hierarchy can be shared
    across multiple datasets.

    Args:
        name: the taxonomy name
        description: optional description
        root: the root :class:`Node` of the hierarchy. Required.

    Example::

        Taxonomy(
            name="vehicle_classes",
            root=Node(
                name="vehicles",
                can_select=False,
                values=[
                    Node(name="car"),
                    Node(name="truck"),
                    Node(name="motorcycle"),
                ],
            ),
        )
    """

    _TYPE = OntologyType.TAXONOMY.value

    def __init__(
        self,
        name: str,
        root: Node,
        description: Optional[str] = None,
    ):
        super().__init__(name=name, description=description)
        if not isinstance(root, Node):
            raise ValueError("Taxonomy.root must be a Node instance")
        self.root = root

    def _validate(self) -> None:
        # Lazy import — ``ontology_validation`` imports ``Taxonomy`` for
        # type hints, so a top-level import here would be circular.
        from fiftyone.core.ontology_validation import validate_taxonomy

        validate_taxonomy(self)

    def _get_root(self) -> dict:
        return self.root.to_dict()

    def _apply_doc(self, doc: OntologyDocument) -> None:
        self.name = doc.name
        self.description = doc.description
        self.root = Node.from_dict(doc.root)

    def to_dict(self) -> dict:
        """Serializes this taxonomy to a dict.

        Returns:
            a dict
        """
        d = super().to_dict()
        d["root"] = self._get_root()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Taxonomy":
        """Creates a :class:`Taxonomy` from a dict.

        Args:
            d: a taxonomy dict

        Returns:
            a :class:`Taxonomy`
        """
        root = d.get("root") or {}
        return cls(
            name=d["name"],
            description=d.get("description"),
            root=Node.from_dict(root),
        )


# ---- Type dispatch --------------------------------------------------------

_TYPE_TO_CLS: dict[str, type[Ontology]] = {
    OntologyType.ANNOTATION_ONTOLOGY.value: AnnotationOntology,
    OntologyType.TAXONOMY.value: Taxonomy,
}


def _from_doc(doc: OntologyDocument) -> Ontology:
    """Constructs the appropriate SDK class from an ODM document."""
    cls = _TYPE_TO_CLS.get(doc.type)
    if cls is None:
        raise ValueError(f"Unknown ontology type: {doc.type!r}")

    root = doc.root or {}
    instance = cls.__new__(cls)
    Ontology.__init__(instance, name=doc.name, description=doc.description)
    instance._doc = doc
    instance._apply_doc(doc)
    return instance


# ---- Module-level CRUD functions ------------------------------------------


def _objects_by_slug(name: str):
    """Query ``OntologyDocument`` by slug-normalized name."""
    return OntologyDocument.objects(  # pylint: disable=no-member
        slug=fou.to_slug(name)
    )


def save_ontology(ontology: Ontology, overwrite: bool = False) -> None:
    """Saves the given ontology to the database.

    Module-level mirror of :meth:`Ontology.save`, paired with
    :func:`load_ontology` and :func:`delete_ontology`.

    Args:
        ontology: an :class:`Ontology` to save
        overwrite: see :meth:`Ontology.save`
    """
    ontology.save(overwrite=overwrite)


def load_ontology(name: str) -> Ontology:
    """Loads the latest version of an ontology by name.

    Args:
        name: the ontology name

    Returns:
        an :class:`Ontology`

    Raises:
        ValueError: if no ontology with the given name exists
    """
    doc = _objects_by_slug(name).order_by("-version").first()
    if doc is None:
        raise ValueError(f"Ontology '{name}' not found")

    return _from_doc(doc)


def _list_by_type(
    glob_patt: Optional[str], ontology_type: str
) -> list[str]:
    """Returns a sorted list of names for ontologies of the given type,
    optionally filtered by a glob pattern.
    """
    query: dict[str, Any] = {"type": ontology_type}
    if glob_patt is not None:
        query["name__regex"] = fnmatch.translate(glob_patt)

    docs = OntologyDocument.objects(**query)  # pylint: disable=no-member
    return sorted(docs.distinct("name"))


def list_ontologies(glob_patt: Optional[str] = None) -> list[str]:
    """Lists annotation ontology names in the database.

    Taxonomies are excluded; use :func:`list_taxonomies` for those.

    Args:
        glob_patt: an optional glob pattern to filter names

    Returns:
        a sorted list of annotation ontology names
    """
    return _list_by_type(glob_patt, OntologyType.ANNOTATION_ONTOLOGY.value)


def ontology_exists(name: str) -> bool:
    """Checks if an ontology (of any type) with the given name exists.

    Args:
        name: the ontology name

    Returns:
        True/False
    """
    return _objects_by_slug(name).count() > 0


# ---- Taxonomy-specific accessors ------------------------------------------
#
# Thin wrappers over the generic ontology functions above that constrain to
# taxonomies, so callers can work with taxonomies without reasoning about
# the shared ``ontologies`` collection or the annotation-ontology type.


def load_taxonomy(name: str) -> "Taxonomy":
    """Loads the latest version of a taxonomy by name.

    Args:
        name: the taxonomy name

    Returns:
        a :class:`Taxonomy`

    Raises:
        ValueError: if no taxonomy with the given name exists, or if the
            name resolves to a non-taxonomy ontology
    """
    try:
        ontology = load_ontology(name)
    except ValueError:
        raise ValueError(f"Taxonomy '{name}' not found") from None

    if not ontology.is_taxonomy:
        raise ValueError(f"'{name}' is not a taxonomy")

    return ontology


def list_taxonomies(glob_patt: Optional[str] = None) -> list[str]:
    """Lists taxonomy names in the database.

    Args:
        glob_patt: an optional glob pattern to filter names

    Returns:
        a sorted list of taxonomy names
    """
    return _list_by_type(glob_patt, OntologyType.TAXONOMY.value)


def taxonomy_exists(name: str) -> bool:
    """Checks if a taxonomy with the given name exists.

    Returns ``False`` if the name resolves to a non-taxonomy ontology.

    Args:
        name: the taxonomy name

    Returns:
        True/False
    """
    if not ontology_exists(name):
        return False

    return load_ontology(name).is_taxonomy


def _find_ontologies_referencing_taxonomy(taxonomy_name: str) -> list[str]:
    """Returns the names of annotation ontologies that bundle the named
    taxonomy via their ``taxonomy`` reference.

    Matches across all versions (a name is reported if any version
    references the taxonomy); the lookup keys on the stored slug.
    """
    slug = fou.to_slug(taxonomy_name)
    docs = OntologyDocument.objects(  # pylint: disable=no-member
        type=OntologyType.ANNOTATION_ONTOLOGY.value,
        root__taxonomy=slug,
    )
    return sorted(docs.distinct("name"))


def delete_taxonomy(name: str, force: bool = False) -> None:
    """Deletes a taxonomy and all its versions from the database.

    If any annotation ontology bundles this taxonomy (via its
    ``taxonomy`` reference), the default behavior is to raise rather than
    leave those ontologies pointing at a deleted taxonomy. Pass
    ``force=True`` to delete anyway.

    Args:
        name: the taxonomy name
        force: if False (default), raise if any annotation ontology
            references the taxonomy. If True, delete regardless

    Raises:
        ValueError: if the taxonomy does not exist (or is not a
            taxonomy), or if it is referenced and ``force=False``
    """
    # Validates existence and type before touching anything; raises a
    # taxonomy-flavored error if not found or not a taxonomy.
    load_taxonomy(name)

    referencing = _find_ontologies_referencing_taxonomy(name)
    if referencing and not force:
        raise ValueError(
            f"Taxonomy '{name}' is referenced by {len(referencing)} "
            f"annotation ontolog(y/ies): {referencing}. Pass force=True "
            "to delete anyway."
        )

    # Reuse the generic delete; a taxonomy is never an ``applied_ontology``
    # target, so there are no label-schema references to inline.
    delete_ontology(name)


class LabelSchemaOntologyRef(NamedTuple):
    """One dataset's ``applied_ontology`` references for a given ontology.

    Attributes:
        dataset_id: the ``DatasetDocument`` id (string form)
        field_names: the label-schema field names on that dataset that
            reference the ontology
    """

    dataset_id: str
    field_names: list[str]


def _find_label_schema_refs_by_ontology(
    ontology_name: str,
) -> list[LabelSchemaOntologyRef]:
    """Finds every label-schema field across every dataset that
    references the named ontology via ``applied_ontology``.

    The filter happens server-side in MongoDB rather than in Python,
    which avoids deserializing every dataset doc and only sends back
    the matches — meaningfully faster than a Python iteration when
    there are many datasets.

    Returns:
        one :class:`LabelSchemaOntologyRef` per dataset that has at
        least one matching reference. Empty if no dataset references
        the ontology.
    """
    from fiftyone.core.odm.dataset import DatasetDocument

    pipeline = [
        # Field names inside ``label_schemas`` are user-defined
        # (``ground_truth``, ``predictions``, etc.), so we can't
        # query them by a fixed path. $objectToArray flattens the
        # dict into ``[{k: "ground_truth", v: {...}}, ...]`` so
        # $filter can iterate it; we keep only the pairs whose
        # value's applied_ontology matches the target. ($$this is
        # the current pair, ``.v`` is its value — the schema dict.)
        {
            "$addFields": {
                "_matching_fields": {
                    "$filter": {
                        "input": {"$objectToArray": "$label_schemas"},
                        "cond": {
                            "$eq": [
                                "$$this.v.applied_ontology",
                                ontology_name,
                            ]
                        },
                    }
                }
            }
        },
        # Drop datasets with zero matches. ``_matching_fields.0``
        # exists iff the array has at least one entry.
        {"$match": {"_matching_fields.0": {"$exists": True}}},
        # Project just the doc id and the field names (.k of each
        # matching {k, v} pair).
        {
            "$project": {
                "_id": 1,
                "matching_fields": "$_matching_fields.k",
            }
        },
    ]

    # pylint: disable-next=no-member
    matches = DatasetDocument.objects.aggregate(pipeline)
    return [
        LabelSchemaOntologyRef(
            dataset_id=str(d["_id"]),
            field_names=d["matching_fields"],
        )
        for d in matches
    ]


def delete_ontology(name: str, force: bool = False) -> None:
    """Deletes an ontology and all its versions from the database.

    If any label schema references this ontology (via
    ``applied_ontology`` on a field), the default behavior is to raise
    rather than silently break those schemas. Pass ``force=True`` to
    inline the ontology's attributes into each affected schema as
    permanent local copies and then delete the ontology.

    Inlining and deletion run as two phases: every affected schema is
    inlined and saved first, and the ontology is deleted only if every
    save succeeds. If something fails mid-inline, the ontology still
    exists and the call is safely re-runnable — already-inlined
    schemas no longer match the lookup.

    Args:
        name: the ontology name
        force: if False (default), raise if any label schema references
            the ontology. If True, inline the ontology's attributes
            into each affected schema as local copies before deleting.

    Raises:
        ValueError: if the ontology does not exist, or if it is in use
            and ``force=False``
    """
    # Late imports to avoid circular dependency with annotation/dataset.
    from fiftyone.core.annotation import inline_applied_ontology
    from fiftyone.core.odm.dataset import DatasetDocument

    ontology = load_ontology(name)
    affected = _find_label_schema_refs_by_ontology(name)

    if affected and not force:
        n_fields = sum(len(ref.field_names) for ref in affected)
        raise ValueError(
            f"Ontology '{name}' is referenced by {n_fields} label-schema "
            f"field(s) across {len(affected)} dataset(s). Pass "
            "force=True to inline the ontology's attributes into each "
            "affected schema and delete."
        )

    for ref in affected:
        # pylint: disable-next=no-member
        dataset_doc = DatasetDocument.objects.get(id=ref.dataset_id)
        for field_name in ref.field_names:
            schema = dataset_doc.label_schemas.get(field_name, {})
            dataset_doc.label_schemas[field_name] = inline_applied_ontology(
                schema, ontology
            )
        dataset_doc.save()

    _objects_by_slug(name).delete()


def apply_ontology(
    label_schemas: dict, field_name: str, ontology_name: Optional[str]
) -> dict:
    """Returns a new ``label_schemas`` dict with an annotation ontology
    attached to (or removed from) the given field.

    Pure function — does not mutate the input. Apply the result via
    :meth:`fiftyone.core.dataset.Dataset.set_label_schemas` to persist.

    Args:
        label_schemas: a label schemas dict
        field_name: the field to attach the ontology to
        ontology_name: name of an annotation ontology to attach, or ``None``
            to unset an existing reference

    Returns:
        a new label schemas dict
    """
    label_schemas = dict(label_schemas)
    field_schema = dict(label_schemas.get(field_name, {}))
    if ontology_name is None:
        # idempotent: no-op if there is no existing reference to unset
        field_schema.pop(foac.APPLIED_ONTOLOGY, None)
    else:
        field_schema[foac.APPLIED_ONTOLOGY] = ontology_name
    label_schemas[field_name] = field_schema
    return label_schemas
