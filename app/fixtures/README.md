# Fixtures

A static web server (the `fixtures` service in `docker-compose.yml`) with files the tests can ask the API to fetch.
It is not published on a host port: only other containers reach it, as `http://fixtures/<file>`.

| File | What it is |
| --- | --- |
| `avatar.png` | A valid 1x1 PNG (PLS-9.5: the avatar import) |
| `avatar.jpg` | A valid 1x1 JPEG |
| `not-an-image.png` | Text with a `.png` name: the import refuses it by its contents (415) |

The API's avatar import refuses addresses inside the network, such as the `db` container (PLS-24.10), except the host
names listed in `AVATAR_IMPORT_ALLOWED_HOSTS`. Compose lists `fixtures` there, and only there.
