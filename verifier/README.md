# Offline customer verifier

Serve this directory once over localhost (`python -m http.server 8090 --directory verifier`), then disconnect network access. The page performs no fetches. Pin the Base64 Ed25519 public key through the contract onboarding channel, choose a downloaded package, and remember its verified head. Export/import customer-held heads to transfer the trust anchor to another browser. A first-time package verifies internal consistency and the pinned provider signature; detecting a complete rehash/re-sign requires a previously retained head.
