# noSQL Backend Data Model

## Data

You can download the data via the script `download_data.py`

## noSQL (MongoDB)

I entertained the idea of using [TinyDB](https://tinydb.readthedocs.io/en/latest/)
with [tinymongo](https://github.com/schapman1974/tinymongo) which is a
lightweight pip installable relational database, but it took over an hour to
ingest 50k images from CIFAR100 (that means make a document with the filepath and
add it to the database...)

I'm instead using MongoDB which looks promising, however, it requires
installing and configuring a server.


## ElasticSearch

TODO
