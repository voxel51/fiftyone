.. _dataset-zoo-fiw:

Families in the Wild
--------------------

Families in the Wild is a public benchmark for recognizing families via facial
images. The dataset contains over 26,642 images of 5,037 faces collected from
978 families. A unique Family ID (FID) is assigned per family, ranging from
F0001-F1018 (i.e., some families were merged or removed since its first release
in 2016). The dataset is a continued work in progress. Any contributions are
both welcome and appreciated!

Faces were cropped from imagery using the five-point face detector MTCNN from
various phototypes (i.e., mostly family photos, along with several profile pics
of individuals (facial shots). The number of members per family varies from
3-to-26, with the number of faces per subject ranging from 1 to >10.

Various levels and types of labels are associated with samples in this dataset.
Family-level labels contain a list of members, each assigned a member ID (MID)
unique to that respective family (e.g., F0011.MID2 refers to member 2 of family
11). Each member has annotations specifying gender and relationship to all
other members in that respective family.

The relationships in FIW are:

.. code-block:: text

    =====  =====
      ID    Type
    =====  =====
        0  not related or self
        1  child
        2  sibling
        3  grandchild
        4  parent
        5  spouse
        6  grandparent
        7  great grandchild
        8  great grandparent
        9  TBD
    =====  =====

Within FiftyOne, each sample corresponds to a single face image and contains
primitive labels of the Family ID, Member ID, etc. The relationship labels are
stored as :ref:`multi-label classifications <multilabel-classification>`,
where each classification represents one relationship that the member has with
another member in the family. The number of relationships will differ from one
person to the next, but all faces of one person will have the same relationship
labels.

Additionally, the labels for the
`Kinship Verification task <https://competitions.codalab.org/competitions/21843>`_
are also loaded into this dataset through FiftyOne. These labels are stored
as classifications just like relationships, but the labels of kinship differ
from those defined above. For example, rather than Parent, the label might be
`fd` representing a Father-Daughter kinship or `md` for Mother-Daughter.

In order to make it easier to browse the dataset in the FiftyOne App, each
sample also contains a `face_id` field containing a unique integer for each
face of a member, always starting at 0. This allows you to filter the `face_id`
field to 0 in the App to show only a single image of each person.

For your reference, the relationship labels are stored in disk in a matrix that
provides the relationship of each member with other members of the family as
well as names and genders. The i-th rows represent the i-th family member's
relationship to the j-th other members.

For example, `FID0001.csv` contains:

.. code-block:: text

    MID     1     2     3     Name    Gender
     1      0     4     5     name1     f
     2      1     0     1     name2     f
     3      5     4     0     name3     m

Here we have three family members, as listed under the MID column (far-left).
Each MID reads across its row. We can see that MID1 is related to MID2 by
4 -> 1 (Parent -> Child), which of course can be viewed as the inverse, i.e.,
MID2 -> MID1 is 1 -> 4. It can also be seen that MID1 and MID3 are spouses of
one another, i.e., 5 -> 5.

.. note::

    The spouse label will likely be removed in future version of this
    dataset. It serves no value to the problem of kinship.

For more information on the data (e.g., statistics, task evaluations,
benchmarks, and more), see the recent journal:

.. code-block:: text

    Robinson, JP, M. Shao, and Y. Fu. "Survey on the Analysis and Modeling of
    Visual Kinship: A Decade in the Making." IEEE Transactions on Pattern
    Analysis and Machine Intelligence (PAMI), 2021.

**Details**

-   Dataset name: ``fiw``
-   Dataset source: https://web.northeastern.edu/smilelab/fiw/
-   Dataset license: https://fulab.sites.northeastern.edu/fiw-download
-   Dataset size: 173.00 MB
-   Tags: ``image, kinship, verification, classification, search-and-retrieval, facial-recognition``
-   Supported splits: ``test, val, train``
-   ZooDataset class:
    :class:`FIWDataset <fiftyone.zoo.datasets.base.FIWDataset>`

.. note::

    For your convenience, FiftyOne provides
    :func:`get_pairwise_labels() <fiftyone.utils.fiw.get_pairwise_labels>`
    and
    :func:`get_identifier_filepaths_map() <fiftyone.utils.fiw.get_identifier_filepaths_map>`
    utilities for FIW.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("fiw", split="test")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load fiw --split test

        fiftyone app launch fiw-test

.. image:: /images/dataset_zoo/fiw.png
   :alt: fiw
   :align: center