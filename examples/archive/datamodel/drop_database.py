"""
Drop the FiftyOne database from server

"""
import fiftyone.core.odm as foo

foo.drop_database()
