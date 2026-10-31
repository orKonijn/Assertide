# Supply a verified official PostgreSQL 17 Debian registry digest.
ARG POSTGRES_IMAGE
FROM ${POSTGRES_IMAGE}
# The restricted pilot always starts as UID 999; its root-only privilege helper
# is unused and otherwise adds a separately compiled Go runtime to the image.
RUN rm /usr/local/bin/gosu
USER 999:999
