FROM alpine
RUN apk add --no-cache tzdata
ENV TZ=America/New_York
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

ENV GOPATH /usr/local/go
ENV REPO $GOPATH/pixlet
ENV PATH "${PATH}:${GOPATH}/bin:${REPO}"

#install prereqs
RUN apk update && \
    apk upgrade -U && \
    apk add curl wget git make libc-dev gcc ca-certificates npm libwebp-dev libwebp-tools bash && \
    rm -rf /var/cache/*
RUN wget "https://go.dev/dl/$(curl 'https://go.dev/VERSION?m=text' | head -1).linux-amd64.tar.gz" && tar -C /usr/local -xzf go*.linux-amd64.tar.gz && rm -f go*.linux-amd64.tar.gz

#Download Pixlet
RUN git clone https://github.com/tidbyt/pixlet.git $REPO 
WORKDIR $REPO

#Build Pixlet
RUN npm install && npm run build
RUN make build

#clean up build prereqs
RUN apk del -r wget git make gcc libc-dev 

WORKDIR /live-solar

COPY . .

# Strip Windows CRLF line endings and ensure scripts are executable
RUN sed -i 's/\r$//' docker-entrypoint.sh render-and-push.sh crontab.* && \
    chmod +x docker-entrypoint.sh render-and-push.sh && \
    for f in crontab.*; do printf '\n' >> "$f"; done

EXPOSE 8080

CMD ["/bin/bash", "docker-entrypoint.sh"]

