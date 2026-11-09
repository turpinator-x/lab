FROM ubuntu:26.04

WORKDIR /app
COPY backup .
RUN chmod +x backup

ENTRYPOINT ["./backup"]
CMD ["list"]
