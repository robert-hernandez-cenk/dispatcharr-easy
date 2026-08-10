# Installing dispatcharr-easy

`dispatcharr-easy` is an overlay, not a separate app: it replaces the
contents of Dispatcharr's own `frontend/dist/` with this project's build.
It requires an already-running Dispatcharr instance — this doc assumes you
have one.

**Compatible Dispatcharr version:** 0.28.2. Installing over a different
version may work, but hasn't been verified — the install scripts below
warn (and the bare-metal script aborts, unless you pass `--force`) on a
version mismatch.

## Docker — single container ("all-in-one" / aio mode)

If you're running Dispatcharr's own `docker-compose.aio.yml`, download this
repo's [`docker-compose.yml`](docker-compose.yml) and use it in place of
Dispatcharr's — it's identical except for the `image:` line, which points
at `ghcr.io/robert-hernandez-cenk/dispatcharr-easy` instead of
`ghcr.io/dispatcharr/dispatcharr`. Your existing `dispatcharr_data` volume
is unaffected.

```bash
docker compose down
# swap in dispatcharr-easy's docker-compose.yml
docker compose up -d
```

## Docker — modular mode (separate web/celery/db/redis containers)

Only the `web` service serves HTTP and static assets — `celery` never
needs the overlay. In your existing `docker-compose.yml`, change only the
`web` service's `image:` line:

```diff
   web:
-    image: ghcr.io/dispatcharr/dispatcharr:latest
+    image: ghcr.io/robert-hernandez-cenk/dispatcharr-easy:latest
```

Leave `celery`'s `image:` pointed at upstream — it doesn't need to change.

```bash
docker compose up -d web
```

## Bare-metal / LXC

If you installed Dispatcharr via its own `debian_install.sh`
(default `APP_DIR=/opt/dispatcharr`):

```bash
curl -fsSL https://github.com/robert-hernandez-cenk/dispatcharr-easy/releases/latest/download/install.sh -o install.sh
chmod +x install.sh

# Preview what would change — makes no changes yet.
./install.sh

# Apply it for real.
sudo ./install.sh --apply
```

`--apply` backs up your current `frontend/dist` to a timestamped path
before installing the new one, so you can always undo:

```bash
sudo ./install.sh --revert
```

If `APP_DIR` isn't `/opt/dispatcharr`, set it:

```bash
APP_DIR=/srv/dispatcharr sudo -E ./install.sh
```
