# Image transcoder

The container pins sharp 0.35.5 and installs dependencies with `npm ci`.
Node 22 uses Debian Trixie so the external HEIC/HEIF decoder can receive
libheif security updates. Builds fail if the installed system libheif is
older than 1.23.4. The HEVC decoder plugin is installed explicitly.

Sharp's SVG, GIF, TIFF, VIPS and HEIF input loaders are blocked. JPEG/PNG
processing remains available; WebP/AVIF pass through, and HEIC/HEIF are
decoded by the system `heif-convert` before sharp processes the resulting PNG.

## Container regression checks

Run from this directory with Docker running:

```sh
docker build --platform linux/amd64 --provenance=false -t oem-imgtrans-check .
docker run --rm --platform linux/amd64 --network none \
  -v "$PWD/server.check.mjs:/app/server.check.mjs:ro" \
  -v "$PWD/test-fixtures:/app/test-fixtures:ro" \
  --entrypoint npm oem-imgtrans-check test
docker run --rm --platform linux/amd64 --entrypoint npm \
  oem-imgtrans-check audit --omit=dev
```

The tests use the production server and native Linux dependencies. They cover
pass-through, size thresholds, EXIF rotation, HEIC/HEIF decoding, concurrent
conversion, and rejection of unsupported formats disguised as PNG.
The 32 by 24 pixel HEIC fixture was generated from a solid RGB image
using sharp and `heif-enc`; it contains no user data.

## Security references

- [sharp libvips advisory](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj)
- [sharp libheif advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)
- [sharp librsvg advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
- [Debian libheif tracker](https://security-tracker.debian.org/tracker/source-package/libheif)

An npm audit result covers npm dependencies, not every system package in the image.
