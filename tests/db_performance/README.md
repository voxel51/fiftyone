# Data Model

## Libraries

-   [MongoDB](https://docs.mongodb.com/)
-   [PyMongo](https://pymongo.readthedocs.io/en/stable/)
-   [PyMODM](https://pymodm.readthedocs.io/en/stable/)
-   [MongoEngine](http://docs.mongoengine.org/)
-   [MongoFrames](http://mongoframes.com/)

## Desired Features

-   `Dataset`s and `Sample`s are Singletons
-   Field Validation
-   Dynamic Schemas
    -   which are saved to the DB
-   Multi-process/user Synchronization
-   Samples/Datasets are updated in memory when modified

...

-   Indexes? …`Sample.filepath`?

## Performance Benchmarking

1. insert one/many
2. update one/many
3. delete one/many

-   What is the idea batch size?
-   How does size of documents affect this?
-   How do indexes affect this? Is `background: true` going to help?
