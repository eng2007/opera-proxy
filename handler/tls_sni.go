package handler

import (
	"bufio"
	"encoding/binary"
	"errors"
	"io"
	"strings"
)

const (
	tlsRecordHeaderLen          = 5
	tlsHandshakeHeaderLen       = 4
	tlsRecordTypeHandshake      = 0x16
	tlsHandshakeTypeClientHello = 0x01
	tlsExtensionServerName      = 0x0000
)

func copyWithSNIRewrite(dst io.Writer, src io.Reader, fakeSNI string) error {
	fakeSNI = strings.TrimSpace(fakeSNI)
	if fakeSNI == "" {
		_, err := io.Copy(dst, src)
		return err
	}

	br, ok := src.(*bufio.Reader)
	if !ok {
		br = bufio.NewReader(src)
	}

	header, err := br.Peek(tlsRecordHeaderLen)
	if err != nil {
		_, copyErr := io.Copy(dst, br)
		if copyErr != nil {
			return copyErr
		}
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return nil
		}
		return err
	}
	if !looksLikeTLSClientHelloRecord(header) {
		_, err = io.Copy(dst, br)
		return err
	}

	recordLen := int(binary.BigEndian.Uint16(header[3:5]))
	record := make([]byte, tlsRecordHeaderLen+recordLen)
	n, err := io.ReadFull(br, record)
	if err != nil {
		if n > 0 {
			if _, writeErr := dst.Write(record[:n]); writeErr != nil {
				return writeErr
			}
		}
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			_, copyErr := io.Copy(dst, br)
			return copyErr
		}
		return err
	}

	if rewritten, ok := rewriteTLSClientHelloRecordServerName(record, fakeSNI); ok {
		record = rewritten
	}

	if _, err := dst.Write(record); err != nil {
		return err
	}
	_, err = io.Copy(dst, br)
	return err
}

func looksLikeTLSClientHelloRecord(header []byte) bool {
	return len(header) >= tlsRecordHeaderLen &&
		header[0] == tlsRecordTypeHandshake &&
		header[1] == 0x03 &&
		header[2] <= 0x04
}

func rewriteTLSClientHelloRecordServerName(record []byte, fakeSNI string) ([]byte, bool) {
	if len(record) < tlsRecordHeaderLen+tlsHandshakeHeaderLen {
		return nil, false
	}
	if !looksLikeTLSClientHelloRecord(record[:tlsRecordHeaderLen]) {
		return nil, false
	}

	payload := record[tlsRecordHeaderLen:]
	if len(payload) < tlsHandshakeHeaderLen || payload[0] != tlsHandshakeTypeClientHello {
		return nil, false
	}

	handshakeLen := readUint24(payload[1:4])
	if handshakeLen > len(payload)-tlsHandshakeHeaderLen {
		// ClientHello is fragmented across multiple TLS records.
		return nil, false
	}

	hello := payload[tlsHandshakeHeaderLen : tlsHandshakeHeaderLen+handshakeLen]
	offset := 0
	if !skipLen(hello, &offset, 2+32) {
		return nil, false
	}
	if !skipOpaque8(hello, &offset) {
		return nil, false
	}
	if !skipOpaque16(hello, &offset) {
		return nil, false
	}
	if !skipOpaque8(hello, &offset) {
		return nil, false
	}
	if offset == len(hello) {
		return nil, false
	}
	if offset+2 > len(hello) {
		return nil, false
	}

	extensionsLenOffset := offset
	extensionsLen := int(binary.BigEndian.Uint16(hello[offset : offset+2]))
	offset += 2
	if offset+extensionsLen > len(hello) {
		return nil, false
	}

	extensionsEnd := offset + extensionsLen
	for offset+4 <= extensionsEnd {
		extStart := offset
		extType := binary.BigEndian.Uint16(hello[offset : offset+2])
		extLen := int(binary.BigEndian.Uint16(hello[offset+2 : offset+4]))
		offset += 4
		if offset+extLen > extensionsEnd {
			return nil, false
		}
		if extType != tlsExtensionServerName {
			offset += extLen
			continue
		}

		extDataStart := offset
		extDataEnd := offset + extLen
		extData := hello[extDataStart:extDataEnd]
		if len(extData) < 5 {
			return nil, false
		}

		serverNameListLen := int(binary.BigEndian.Uint16(extData[:2]))
		if 2+serverNameListLen > len(extData) {
			return nil, false
		}
		if extData[2] != 0x00 {
			return nil, false
		}

		nameLen := int(binary.BigEndian.Uint16(extData[3:5]))
		if 5+nameLen > len(extData) {
			return nil, false
		}

		tail := extData[5+nameLen:]
		newExtData := make([]byte, 2+1+2+len(fakeSNI)+len(tail))
		binary.BigEndian.PutUint16(newExtData[:2], uint16(1+2+len(fakeSNI)+len(tail)))
		newExtData[2] = 0x00
		binary.BigEndian.PutUint16(newExtData[3:5], uint16(len(fakeSNI)))
		copy(newExtData[5:], fakeSNI)
		copy(newExtData[5+len(fakeSNI):], tail)

		helloStart := tlsRecordHeaderLen + tlsHandshakeHeaderLen
		extLenFieldStart := helloStart + extStart + 2
		extDataAbsStart := helloStart + extDataStart
		extDataAbsEnd := helloStart + extDataEnd
		extensionsLenFieldStart := helloStart + extensionsLenOffset

		delta := len(newExtData) - len(extData)
		newRecord := make([]byte, 0, len(record)+delta)
		newRecord = append(newRecord, record[:extDataAbsStart]...)
		newRecord = append(newRecord, newExtData...)
		newRecord = append(newRecord, record[extDataAbsEnd:]...)

		binary.BigEndian.PutUint16(newRecord[3:5], uint16(len(payload)+delta))
		writeUint24(newRecord[6:9], handshakeLen+delta)
		binary.BigEndian.PutUint16(newRecord[extensionsLenFieldStart:extensionsLenFieldStart+2], uint16(extensionsLen+delta))
		binary.BigEndian.PutUint16(newRecord[extLenFieldStart:extLenFieldStart+2], uint16(extLen+delta))

		return newRecord, true
	}

	return nil, false
}

func readUint24(b []byte) int {
	return int(b[0])<<16 | int(b[1])<<8 | int(b[2])
}

func writeUint24(dst []byte, v int) {
	dst[0] = byte(v >> 16)
	dst[1] = byte(v >> 8)
	dst[2] = byte(v)
}

func skipLen(b []byte, offset *int, n int) bool {
	if *offset+n > len(b) {
		return false
	}
	*offset += n
	return true
}

func skipOpaque8(b []byte, offset *int) bool {
	if *offset >= len(b) {
		return false
	}
	l := int(b[*offset])
	*offset++
	return skipLen(b, offset, l)
}

func skipOpaque16(b []byte, offset *int) bool {
	if *offset+2 > len(b) {
		return false
	}
	l := int(binary.BigEndian.Uint16(b[*offset : *offset+2]))
	*offset += 2
	return skipLen(b, offset, l)
}
