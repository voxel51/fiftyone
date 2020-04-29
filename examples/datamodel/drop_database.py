"""
Drop the FiftyOne database from server

"""
import fiftyone.core.dataset as voxd

voxd.drop_database()
