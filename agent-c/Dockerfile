# Multi-stage build for the C MQTT sensor agent (EdgeFlow mode)

FROM ubuntu:22.04 AS builder

RUN apt-get update -qq && apt-get install -y -qq \
    cmake \
    build-essential \
    pkg-config \
    libmosquitto-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN rm -rf build && mkdir -p build && cd build && cmake .. && make -j"$(nproc)"

# Runtime stage: only needs the shared mosquitto runtime library
FROM ubuntu:22.04

RUN apt-get update -qq && apt-get install -y -qq \
    libmosquitto1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/build/agent-c ./agent-c
COPY --from=builder /app/config ./config

CMD ["./agent-c"]
