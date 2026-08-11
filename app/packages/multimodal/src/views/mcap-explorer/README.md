# MCAP explorer

This domain owns the user-facing workflow for opening an arbitrary local or
remote MCAP recording and presenting it as an episode.

The format name describes the product surface, not an implementation boundary.
The explorer validates user input and composes neutral episode capabilities; it
does not parse MCAP, consume generated schemas, or import adapter internals.

HTTP(S) sources are supported by the shared product surface. Product
entrypoints may register a cloud-source resolver that exchanges configured
storage paths for browser-readable URLs before byte reads begin.
