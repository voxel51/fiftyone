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
from typing import Any, Optional

import fiftyone.core.utils as fou
from fiftyone.core.annotation.attributes import (
    AttributeSpec,
    attr_insert_to_dict,
)
from fiftyone.core.odm.ontology import OntologyDocument, OntologyType
from fiftyone.internal.features.registry import require_feature


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

    _TYPE: Optional[str] = None

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

    @require_feature("VFF_ONTOLOGY_CA")
    def save(self) -> None:
        """Saves this ontology to the database."""
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

    @require_feature("VFF_ONTOLOGY_CA")
    def reload(self) -> None:
        """Reloads this ontology from the database."""
        if self._doc is None:
            raise ValueError(
                "Cannot reload an ontology that has not been saved"
            )

        self._doc.reload()
        self._apply_doc(self._doc)

    @require_feature("VFF_ONTOLOGY_CA")
    def delete(self) -> None:
        """Deletes this ontology from the database."""
        if self._doc is None:
            raise ValueError(
                "Cannot delete an ontology that has not been saved"
            )

        self._doc.delete()
        self._doc = None

    @require_feature("VFF_ONTOLOGY_CA")
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
    taxonomy references into a single document that gets connected to a
    label schema on a field.

    Args:
        name: the ontology name
        description: optional description
        taxonomies: list of taxonomy names referenced by this ontology
        attributes: list of :class:`AttributeSpec` instances

    Example::

        AnnotationOntology(
            name="vehicle_damage_ontology",
            description="Vehicle damage annotation",
            taxonomies=["vehicle_classes"],
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
                    when=[When(WhenOperator.EQUALS, field="damage_present", value=True)],
                ),
            ],
        )
    """

    _TYPE = OntologyType.ANNOTATION_ONTOLOGY.value

    def __init__(
        self,
        name: str,
        description: Optional[str] = None,
        taxonomies: Optional[list[str]] = None,
        attributes: Optional[list[AttributeSpec]] = None,
    ):
        super().__init__(name=name, description=description)
        self.taxonomies = taxonomies or []
        self.attributes = attributes or []

    def _get_root(self) -> dict:
        return {
            "taxonomies": self.taxonomies,
            "attributes": [attr.to_dict() for attr in self.attributes],
        }

    def _apply_doc(self, doc: OntologyDocument) -> None:
        self.name = doc.name
        self.description = doc.description
        self.taxonomies = doc.root.get("taxonomies", [])
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
        return cls(
            name=d["name"],
            description=d.get("description"),
            taxonomies=root.get("taxonomies", []),
            attributes=[
                AttributeSpec.from_dict(a) for a in root.get("attributes", [])
            ],
        )
# ---- Type dispatch --------------------------------------------------------

_TYPE_TO_CLS: dict[str, type[Ontology]] = {
    OntologyType.ANNOTATION_ONTOLOGY.value: AnnotationOntology,
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


@require_feature("VFF_ONTOLOGY_CA")
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


@require_feature("VFF_ONTOLOGY_CA")
def list_ontologies(glob_patt: Optional[str] = None) -> list[str]:
    """Lists ontology names in the database.

    Args:
        glob_patt: an optional glob pattern to filter names

    Returns:
        a sorted list of ontology names
    """
    if glob_patt is not None:
        regex = fnmatch.translate(glob_patt)
        docs = OntologyDocument.objects(  # pylint: disable=no-member
            name__regex=regex
        )
    else:
        docs = OntologyDocument.objects()  # pylint: disable=no-member

    return sorted(docs.distinct("name"))


@require_feature("VFF_ONTOLOGY_CA")
def ontology_exists(name: str) -> bool:
    """Checks if an ontology with the given name exists.

    Args:
        name: the ontology name

    Returns:
        True/False
    """
    return _objects_by_slug(name).count() > 0


@require_feature("VFF_ONTOLOGY_CA")
def delete_ontology(name: str, force: bool = False) -> None:
    """Deletes an ontology and all its versions from the database.

    Args:
        name: the ontology name
        force: whether to delete even if the ontology is in use.
            By default, raises an error if the ontology is referenced
            by a label schema. Not yet enforced — will be implemented
            with label schema integration.
    """
    # TODO: check if in use when force=False (requires label schema integration)
    count = _objects_by_slug(name).delete()
    if count == 0:
        raise ValueError(f"Ontology '{name}' not found")
