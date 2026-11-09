FROM ubuntu:26.04

WORKDIR /app

COPY greet .
RUN chmod +x greet

ENV GREETING=Hello
ENV NAME=World

CMD ["./greet"]
