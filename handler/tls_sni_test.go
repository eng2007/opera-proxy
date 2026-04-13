package handler

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestRewriteTLSClientHelloRecordServerName(t *testing.T) {
	record := buildClientHelloRecord("example.com")

	rewritten, ok := rewriteTLSClientHelloRecordServerName(record, "fake.example")
	if !ok {
		t.Fatal("expected ClientHello record to be rewritten")
	}

	if got := extractServerName(t, rewritten); got != "fake.example" {
		t.Fatalf("unexpected SNI after rewrite: got %q", got)
	}
	if got := int(binary.BigEndian.Uint16(rewritten[3:5])); got != len(rewritten)-tlsRecordHeaderLen {
		t.Fatalf("unexpected TLS record length: got %d want %d", got, len(rewritten)-tlsRecordHeaderLen)
	}
	if got := readUint24(rewritten[6:9]); got != len(rewritten)-tlsRecordHeaderLen-tlsHandshakeHeaderLen {
		t.Fatalf("unexpected handshake length: got %d want %d", got, len(rewritten)-tlsRecordHeaderLen-tlsHandshakeHeaderLen)
	}
}

func TestCopyWithSNIRewritePreservesTrailingBytes(t *testing.T) {
	record := buildClientHelloRecord("example.com")
	stream := append(append([]byte{}, record...), []byte("tail")...)

	var dst bytes.Buffer
	if err := copyWithSNIRewrite(&dst, bytes.NewReader(stream), "fake.example"); err != nil {
		t.Fatalf("copyWithSNIRewrite returned error: %v", err)
	}

	out := dst.Bytes()
	recordLen := int(binary.BigEndian.Uint16(out[3:5])) + tlsRecordHeaderLen
	if got := extractServerName(t, out[:recordLen]); got != "fake.example" {
		t.Fatalf("unexpected SNI in output stream: got %q", got)
	}
	if tail := string(out[recordLen:]); tail != "tail" {
		t.Fatalf("unexpected trailing bytes: got %q", tail)
	}
}

func TestRewriteTLSClientHelloRecordServerNameSkipsFragmentedHello(t *testing.T) {
	record := buildClientHelloRecord("example.com")
	record[6] = 0x7f
	record[7] = 0xff
	record[8] = 0xff

	if _, ok := rewriteTLSClientHelloRecordServerName(record, "fake.example"); ok {
		t.Fatal("expected fragmented ClientHello rewrite to be skipped")
	}
}

func buildClientHelloRecord(serverName string) []byte {
	sniExtData := make([]byte, 2+1+2+len(serverName))
	binary.BigEndian.PutUint16(sniExtData[:2], uint16(1+2+len(serverName)))
	sniExtData[2] = 0x00
	binary.BigEndian.PutUint16(sniExtData[3:5], uint16(len(serverName)))
	copy(sniExtData[5:], serverName)

	sniExt := makeExtension(tlsExtensionServerName, sniExtData)
	otherExt := makeExtension(0x002b, []byte{0x02, 0x03, 0x04})
	extensions := append(sniExt, otherExt...)

	hello := make([]byte, 0, 128)
	hello = append(hello, 0x03, 0x03)
	hello = append(hello, bytes.Repeat([]byte{0x11}, 32)...)
	hello = append(hello, 0x00)
	hello = append(hello, 0x00, 0x02, 0x13, 0x01)
	hello = append(hello, 0x01, 0x00)
	hello = append(hello, byte(len(extensions)>>8), byte(len(extensions)))
	hello = append(hello, extensions...)

	record := make([]byte, 0, tlsRecordHeaderLen+tlsHandshakeHeaderLen+len(hello))
	record = append(record, tlsRecordTypeHandshake, 0x03, 0x03)
	recordLen := tlsHandshakeHeaderLen + len(hello)
	record = append(record, byte(recordLen>>8), byte(recordLen))
	record = append(record, tlsHandshakeTypeClientHello)
	record = append(record, byte(len(hello)>>16), byte(len(hello)>>8), byte(len(hello)))
	record = append(record, hello...)
	return record
}

func makeExtension(extType uint16, data []byte) []byte {
	ext := make([]byte, 4+len(data))
	binary.BigEndian.PutUint16(ext[:2], extType)
	binary.BigEndian.PutUint16(ext[2:4], uint16(len(data)))
	copy(ext[4:], data)
	return ext
}

func extractServerName(t *testing.T, record []byte) string {
	t.Helper()

	payload := record[tlsRecordHeaderLen:]
	handshakeLen := readUint24(payload[1:4])
	hello := payload[tlsHandshakeHeaderLen : tlsHandshakeHeaderLen+handshakeLen]

	offset := 2 + 32
	sessionIDLen := int(hello[offset])
	offset++
	offset += sessionIDLen

	cipherSuitesLen := int(binary.BigEndian.Uint16(hello[offset : offset+2]))
	offset += 2 + cipherSuitesLen

	compressionMethodsLen := int(hello[offset])
	offset++
	offset += compressionMethodsLen

	extensionsLen := int(binary.BigEndian.Uint16(hello[offset : offset+2]))
	offset += 2
	extensionsEnd := offset + extensionsLen
	for offset+4 <= extensionsEnd {
		extType := binary.BigEndian.Uint16(hello[offset : offset+2])
		extLen := int(binary.BigEndian.Uint16(hello[offset+2 : offset+4]))
		offset += 4
		if extType != tlsExtensionServerName {
			offset += extLen
			continue
		}
		extData := hello[offset : offset+extLen]
		nameLen := int(binary.BigEndian.Uint16(extData[3:5]))
		return string(extData[5 : 5+nameLen])
	}

	t.Fatal("server_name extension not found")
	return ""
}
