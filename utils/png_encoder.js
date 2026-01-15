
/**
 * Fast, uncompressed PNG Encoder for UXP.
 * Optimized for local transfer speed by avoiding CPU-intensive Deflate compression.
 */
class PngEncoder {
    constructor(width, height, channels = 4) {
        this.width = width;
        this.height = height;
        this.channels = channels; // 3 or 4
        this.crcTable = null;
    }

    makeCrcTable() {
        if (this.crcTable) return;
        this.crcTable = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                if (c & 1) c = 0xedb88320 ^ (c >>> 1);
                else c = c >>> 1;
            }
            this.crcTable[n] = c;
        }
    }

    crc32(buf) {
        this.makeCrcTable();
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            crc = this.crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
        }
        return crc ^ 0xffffffff;
    }

    adler32(buf) {
        let a = 1, b = 0, L = buf.length, M = 0;
        while (L > 0) {
            let n = L > 3800 ? 3800 : L;
            L -= n;
            for (let i = 0; i < n; i++) {
                a += buf[M++];
                b += a;
            }
            a %= 65521;
            b %= 65521;
        }
        return (b << 16) | a;
    }

    /**
     * Encodes raw pixel data (RGBA or RGB) into a PNG buffer.
     * @param {Uint8Array} data - Raw pixel data
     * @returns {Uint8Array} - PNG file buffer
     */
    encode(data) {
        // PNG Signature
        const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

        // IHDR Chunk
        const IHDRContent = new Uint8Array(13);
        const view = new DataView(IHDRContent.buffer);
        view.setUint32(0, this.width);
        view.setUint32(4, this.height);
        view.setUint8(8, 8); // Bit depth: 8
        view.setUint8(9, this.channels === 4 ? 6 : 2); // Color type: 6 (Truecolor+Alpha) or 2 (Truecolor)
        view.setUint8(10, 0); // Compression method: 0
        view.setUint8(11, 0); // Filter method: 0
        view.setUint8(12, 0); // Interlace method: 0 (no interlace)

        const IHDR = this.createChunk("IHDR", IHDRContent);

        // IDAT Chunk (Uncompressed Deflate Block)
        // Deflate format:
        // Header (2 bytes): 0x78 (Deflate) 0x01 (No Compression/Low) -> actually 0x78 0x9C is default, but for uncompressed:
        // We use "No Compression" block mode of Deflate.
        // Block header: 1 bit (final), 2 bits (type 00=stored), align to byte boundary.
        // LEN (2 bytes), NLEN (2 bytes), Data...
        // 
        // For simplicity in JS without zlib, we wrap raw data in a zlib stream with "stored" blocks.
        // Each scanline needs a filter byte (0) prefixed.

        const scanlineLen = this.width * this.channels;
        const totalScanlines = this.height;
        const rawLen = totalScanlines * (scanlineLen + 1); // +1 for filter byte per line
        const filteredData = new Uint8Array(rawLen);

        for (let y = 0; y < this.height; y++) {
            filteredData[y * (scanlineLen + 1)] = 0; // Filter Type 0 (None)
            // Copy scanline
            filteredData.set(data.subarray(y * scanlineLen, (y + 1) * scanlineLen), y * (scanlineLen + 1) + 1);
        }

        // Create Zlib Stream (Uncompressed)
        // Max block size for uncompressed deflate is 65535. We need to split.
        const blocks = [];
        let offset = 0;
        const maxBlockSize = 65535;

        while (offset < filteredData.length) {
            const len = Math.min(maxBlockSize, filteredData.length - offset);
            const isFinal = (offset + len) === filteredData.length;
            const header = isFinal ? 1 : 0; // Final block marker (type 00 is implicit as we output bytes directly)

            // Deflate Stored Block Header:
            // 3 bits: BFINAL(1) BTYPE(2) -> Stored is 00.
            // If final: 100 = 1 (little endian byte: 00000001) -> 0x01
            // If not final: 000 = 0 -> 0x00

            const blockHeader = new Uint8Array(5 + len);
            blockHeader[0] = isFinal ? 0x01 : 0x00;

            // LEN (2 bytes, little endian)
            blockHeader[1] = len & 0xff;
            blockHeader[2] = (len >>> 8) & 0xff;

            // NLEN (one's complement of LEN)
            blockHeader[3] = (~len) & 0xff;
            blockHeader[4] = ((~len) >>> 8) & 0xff;

            // Data
            blockHeader.set(filteredData.subarray(offset, offset + len), 5);
            blocks.push(blockHeader);

            offset += len;
        }

        // Zlib encapsulation
        // Header: 0x78 0x01 (No compression / Fastest) - 0x7801 is valid zlib header.
        const zlibHeader = new Uint8Array([0x78, 0x01]);

        // Adler32 checksum at the end (4 bytes, big endian)
        const adler = this.adler32(filteredData);
        const adlerBytes = new Uint8Array(4);
        adlerBytes[0] = (adler >>> 24) & 0xff;
        adlerBytes[1] = (adler >>> 16) & 0xff;
        adlerBytes[2] = (adler >>> 8) & 0xff;
        adlerBytes[3] = adler & 0xff;

        // Combine IDAT
        let totalIdatLen = zlibHeader.length + adlerBytes.length;
        blocks.forEach(b => totalIdatLen += b.length);
        const IDATContent = new Uint8Array(totalIdatLen);

        let p = 0;
        IDATContent.set(zlibHeader, p); p += zlibHeader.length;
        blocks.forEach(b => {
            IDATContent.set(b, p); p += b.length;
        });
        IDATContent.set(adlerBytes, p);

        const IDAT = this.createChunk("IDAT", IDATContent);

        // IEND Chunk
        const IEND = this.createChunk("IEND", new Uint8Array(0));

        // Combine all chunks
        const fileSize = signature.length + IHDR.length + IDAT.length + IEND.length;
        const pngFile = new Uint8Array(fileSize);
        p = 0;
        pngFile.set(signature, p); p += signature.length;
        pngFile.set(IHDR, p); p += IHDR.length;
        pngFile.set(IDAT, p); p += IDAT.length;
        pngFile.set(IEND, p);

        return pngFile;
    }

    createChunk(type, data) {
        const len = data.length;
        const chunk = new Uint8Array(len + 12);
        const view = new DataView(chunk.buffer);

        view.setUint32(0, len); // Length

        // Type
        for (let i = 0; i < 4; i++) {
            chunk[4 + i] = type.charCodeAt(i);
        }

        // Data
        chunk.set(data, 8);

        // CRC (Type + Data)
        const crcInput = chunk.subarray(4, 8 + len);
        const crc = this.crc32(crcInput);
        view.setUint32(8 + len, crc);

        return chunk;
    }
}

module.exports = PngEncoder;
