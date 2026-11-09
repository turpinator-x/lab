FROM ubuntu:26.04
RUN apt-get update && apt-get install -y curl ca-certificates
WORKDIR /app
COPY greet .
CMD ["./greet"]
