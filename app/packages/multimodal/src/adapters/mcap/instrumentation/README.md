# MCAP instrumentation

`meters/` contains headless, dependency-light observation contracts used by
decoder, reader, resource-client, and worker hot paths. Adapter-owned reporting
and browser debug interpretation live in `host/`, above those implementation
layers and below the adapter facade.
