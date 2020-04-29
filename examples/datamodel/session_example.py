"""
Explore CIFAR100 via a `fiftyone.core.session.Session` instance.

"""
import logging

import eta.core.serial as etas

import fiftyone.core.dataset as voxd
import fiftyone.core.session as voxs
import fiftyone.core.query as voxq


logger = logging.getLogger(__name__)

###############################################################################
# Initialize the Session
#
# GUI displays dataset browser landing page
###############################################################################

session = voxs.Session()
print("Empty session:")
print(etas.pretty_str(session.state))
print()

###############################################################################
# Set the dataset
#
# GUI displays CIFAR100 dataset
###############################################################################

session.dataset = voxd.Dataset("cifar100")
print("CIFAR100 dataset set:")
print(etas.pretty_str(session.state))
print()

###############################################################################
# Set the view
#
# GUI displays CIFAR100 'train' set
###############################################################################

session.view = session.dataset.get_view("test")
print("'train' view set:")
print(etas.pretty_str(session.state))
print()

###############################################################################
# Set the query
#
# GUI displays filtered/sorted CIFAR100 'train' set
###############################################################################

session.query = (
    voxq.DatasetQuery()
    .filter({"metadata.size_bytes": {"$gt": 1000}})
    .sort("metadata.size_bytes")
)
print("'metadata.size_bytes > 1000' query set:")
print(etas.pretty_str(session.state))
print()


###############################################################################
# Clear the view
#
# GUI displays filtered/sorted CIFAR100 dataset
###############################################################################

session.clear_view()
print("View cleared:")
print(etas.pretty_str(session.state))
print()

###############################################################################
# Clear the query
#
# GUI displays CIFAR100 dataset
###############################################################################

session.clear_query()
print("Query cleared:")
print(etas.pretty_str(session.state))
print()

###############################################################################
# Clear the dataset
#
# GUI displays dataset browser
###############################################################################

session.clear_dataset()
print("Dataset cleared:")
print(etas.pretty_str(session.state))
print()
