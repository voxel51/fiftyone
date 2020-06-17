# Performance Benchmarking

This directory includes tests benchmarking the processing time of CRUD
operations using different MongoDB python libraries.

Run `performance.py` to measure processing times and plot them.

Below are some notes related to this study.

## Libraries

-   [MongoDB](https://docs.mongodb.com/)
-   [PyMongo](https://pymongo.readthedocs.io/en/stable/)
-   [~~PyMODM~~](https://pymodm.readthedocs.io/en/stable/)
-   [MongoEngine](http://docs.mongoengine.org/)
-   [MongoFrames](http://mongoframes.com/)

## Benchmarking Measures

CRUD

1. create one/many
2. read one/many
3. update one/many
4. delete one/many

-   What is the idea batch size? -> ~1000
-   How does size of documents affect this?
-   How do indexes affect this? Is `background: true` going to help?
-   `MongoFrames`? Or pure `PyMongo`?? -> `PyMongo`
-   Schemas? Validation? ->
    [schema validation](https://docs.mongodb.com/manual/core/schema-validation/)

## Desired Features

-   `Dataset`s and `Sample`s are Singletons -> _implement no matter what_
-   Field Validation -> _would need to be supported in `MongoFrames`_
-   Dynamic Schemas -> _implement no matter what_
    -   which are saved to the DB
-   Multi-process/user Synchronization
-   Samples/Datasets are updated in memory when modified
-   EmbeddedDocuments, subclassing and serialization

...

-   Indexes? …`Sample.filepath`?

### Idea

-   Samples are automatically saved when modified
-   Use an `UpdateContext` to modify many samples and save every...1000
    modifies.
-   `Sample.reload()` and `Dataset.reload()` reload from the database.
