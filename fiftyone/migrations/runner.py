"""
FiftyOne migrations runner.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.dataset as fod


DOWN = "down"
up = "up"


class Runner(object):
    """Migration runner

    Args:
        head: the current head revision
        destination: the destination head revision
        revisions: the list of revisions
    """

    def __init__(self, head=None, destination=None, revisions=[]):
        self.head = head
        self.destination = destination
        self.revisions = revisions

    def run(self):
        """Runs the revisions"""
        path = self._get_path()
        for revision in path:
            print(revision)

        head_json = {"head": self.destination}
        etas.write_json(head_json, foc.MIGRATIONS_HEAD_PATH)

    def _get_path(self):
        if self.destination is None:
            destination_idx = 0
        else:
            destination_idx = self.revisions.index(self.destination) + 1

        if self.head is None:
            head_idx = -1
        else:
            head_idx = self.revisions.index(self.head)

        direction = 1
        if head_idx > destination_idx:
            action = DOWN
            direction = -1
            head_idx -= 1

        return self.revisions[head_idx - 1 : destination_idx - 1 : direction]


def _list_revisions():
    return etau.list_files(foc.MIGRATIONS_REVISIONS_DIR)


def _load_head():
    head_path = foc.MIGRATIONS_HEAD_PATH

    if os.path.isfile(head_path):
        head_json = etas.load_json(foc.MIGRATIONS_HEAD_PATH)
        return head_json["head"]

    return None


def migrate_if_necessary():
    """Migrates the database model to the latest revision"""
    revisions = _list_revisions()
    head = _load_head()
    latest_revision = revisions[-1]
    if head is None or head < latest_revision:
        Runner(
            head=head, destination=latest_revision, revisions=revisions
        ).run()
