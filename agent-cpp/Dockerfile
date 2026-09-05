# Multi-stage build for the C++ IoT edge agent simulator

FROM ubuntu:22.04 AS builder

RUN apt-get update -qq && apt-get install -y -qq \
    cmake \
    build-essential \
    pkg-config \
    libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN rm -rf build && mkdir -p build && cd build && cmake .. && make -j"$(nproc)"

# Runtime stage: only needs the shared libcurl runtime, not the -dev headers/toolchain
FROM ubuntu:22.04

RUN apt-get update -qq && apt-get install -y -qq \
    libcurl4 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/build/agent ./agent
COPY --from=builder /app/build/vibration_sensor ./vibration_sensor
COPY --from=builder /app/config ./config

CMD ["./agent"]
