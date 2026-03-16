PROGNAME = opera-proxy
OUTSUFFIX = bin/$(PROGNAME)
BUILDOPTS = -a -tags netgo -trimpath -asmflags -trimpath
LDFLAGS = -ldflags '-s -w -extldflags "-static"'

GO := go

src = $(wildcard *.go */*.go */*/*.go) go.mod go.sum

all: bin-openwrt-banana-r4 bin-windows-x64

bin-openwrt-banana-r4: $(OUTSUFFIX).openwrt-banana-r4
bin-windows-x64: $(OUTSUFFIX).windows-x64.exe

$(OUTSUFFIX).openwrt-banana-r4: $(src)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build $(BUILDOPTS) $(LDFLAGS) -o $@

$(OUTSUFFIX).windows-x64.exe: $(src)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build $(BUILDOPTS) $(LDFLAGS) -o $@

clean:
	rm -f bin/*

fmt:
	$(GO) fmt ./...

run:
	$(GO) run $(LDFLAGS) .

.PHONY: clean all fmt \
	bin-openwrt-banana-r4 \
	bin-windows-x64
