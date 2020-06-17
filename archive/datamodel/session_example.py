"""
Explore CIFAR100 via a `fiftyone.core.session.Session` instance.

"""
import logging

import eta.core.serial as etas

import fiftyone.core.dataset as fod
import fiftyone.core.session as fos


logger = logging.getLogger(__name__)


def print_state(session):
    """Replace the sample dicts with strings to condense the output"""
    state = session.state
    state["samples"] = {
        k: v["filepath"] + ", ..." for k, v in state["samples"].items()
    }
    print(etas.pretty_str(session.state))


###############################################################################
# Initialize the Session
#
# GUI displays dataset browser landing page
###############################################################################

session = fos.Session()
print("Empty session:")
print_state(session)
print()

###############################################################################
# Set the dataset
#
# GUI displays CIFAR100 dataset
###############################################################################

session.dataset = fod.Dataset("cifar100")
print("CIFAR100 dataset set:")
print_state(session)
print()

###############################################################################
# Set the view
#
# GUI displays CIFAR100 'train' set
###############################################################################

session.view = session.dataset.default_view().match_tag("test")
print("'test' view set:")
print_state(session)
print()

###############################################################################
# Add transforms to the view
#
# GUI displays filtered/sorted CIFAR100 'test' set
###############################################################################

session.view = session.view.match(
    {"metadata.size_bytes": {"$gt": 1000}}
).sort_by("metadata.size_bytes")
print("'metadata.size_bytes > 1000' transform added:")
print_state(session)
print()


###############################################################################
# Clear the view
#
# GUI displays filtered/sorted CIFAR100 dataset
###############################################################################

session.clear_view()
session.offset = session.limit
print("view cleared and offset increased:")
print_state(session)
print()

###############################################################################
# Clear the dataset
#
# GUI displays dataset browser
###############################################################################

session.clear_dataset()
print("Dataset cleared:")
print_state(session)
print()
