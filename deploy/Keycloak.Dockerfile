# Supply a reviewed ARM-capable quay.io/keycloak/keycloak@sha256:... base.
ARG KEYCLOAK_IMAGE
FROM alpine:3.23 AS patched-library
ADD https://repo.maven.apache.org/maven2/com/google/guava/guava/33.7.2-jre/guava-33.7.2-jre.jar /guava.jar
RUN echo 'b530942257fb935f8b2cfaa5f8eb5bd59c555fd8e8d01b8ce98912e077ea606c  /guava.jar' | sha256sum -c -

FROM ${KEYCLOAK_IMAGE} AS build
RUN test -f /opt/keycloak/lib/lib/main/com.google.guava.guava-33.6.0-jre.jar
COPY --from=patched-library --chown=1000:0 /guava.jar /opt/keycloak/lib/lib/main/com.google.guava.guava-33.6.0-jre.jar
ENV KC_DB=postgres KC_HEALTH_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM ${KEYCLOAK_IMAGE}
COPY --from=build /opt/keycloak/ /opt/keycloak/
ENV KC_DB=postgres KC_HEALTH_ENABLED=true
USER 1000:1000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]
