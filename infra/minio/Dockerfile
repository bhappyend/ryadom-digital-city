# Optional LOCAL storage only. Upstream community distribution is archived/source-only.
# No context COPY: root secrets and original project assets cannot enter the build.
FROM golang:1.26.2-alpine@sha256:f85330846cde1e57ca9ec309382da3b8e6ae3ab943d2739500e08c86393a21b1 AS builder
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOBIN=/out
# Signed release RELEASE.2025-10-15T17-29-55Z resolved to its immutable commit.
RUN go install -trimpath -ldflags="-s -w" github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a

FROM alpine:3.22.1@sha256:4bcff63911fcb4448bd4fdacec207030997caf25e9bea4045fa6c8c44de311d1
RUN mkdir -p /data && chown 10001:10001 /data
COPY --from=builder /out/minio /usr/local/bin/minio
USER 10001:10001
VOLUME ["/data"]
EXPOSE 9000 9001
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -q -T 3 -O /dev/null http://127.0.0.1:9000/minio/health/live || exit 1
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
