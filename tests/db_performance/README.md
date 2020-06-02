# Data Model

## Libraries

-   [MongoDB](https://docs.mongodb.com/)
-   [PyMongo](https://pymongo.readthedocs.io/en/stable/)
-   [~~PyMODM~~](https://pymodm.readthedocs.io/en/stable/)
-   [MongoEngine](http://docs.mongoengine.org/)
-   [MongoFrames](http://mongoframes.com/)

## Desired Features

-   `Dataset`s and `Sample`s are Singletons -> _implement no matter what_
-   Field Validation -> _would need to be supported in `MongoFrames`_
-   Dynamic Schemas -> _implement no matter what_
    -   which are saved to the DB
-   Multi-process/user Synchronization
-   Samples/Datasets are updated in memory when modified

...

-   Indexes? …`Sample.filepath`?

### Idea

-   Samples are automatically saved when modified
-   Use an `UpdateConext` to modify many samples and save every...1000
    modifies.

## Performance Benchmarking

CRUD

1. create one/many
2. read one/many
3. update one/many
4. delete one/many

-   What is the idea batch size? -> 1000
-   How does size of documents affect this?
-   How do indexes affect this? Is `background: true` going to help?
