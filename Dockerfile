FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jdk maven python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["bash"]

