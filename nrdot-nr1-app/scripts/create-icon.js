const fs = require('fs');
const path = require('path');

// Simple PNG icon generator
// Creates a basic 512x512 PNG icon for NRDOT

function createIcon() {
  // PNG file signature
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // Image dimensions
  const width = 512;
  const height = 512;
  
  // Create IHDR chunk (Image Header)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method
  
  // Create image data (simple gradient with NRDOT colors)
  const imageData = [];
  
  for (let y = 0; y < height; y++) {
    imageData.push(0); // filter type
    for (let x = 0; x < width; x++) {
      // Calculate distance from center
      const dx = x - width / 2;
      const dy = y - height / 2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxDistance = Math.min(width, height) / 2;
      
      // Create circular gradient
      if (distance < maxDistance * 0.9) {
        if (distance < maxDistance * 0.7) {
          // Inner circle - teal color (#007e8b)
          imageData.push(0, 126, 139, 255);
        } else {
          // Ring - lighter teal
          const alpha = 255 - Math.floor((distance - maxDistance * 0.7) / (maxDistance * 0.2) * 155);
          imageData.push(0, 126, 139, alpha);
        }
      } else {
        // Transparent background
        imageData.push(0, 0, 0, 0);
      }
    }
  }
  
  // Compress data using Node's zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(imageData));
  
  // Create chunks
  const chunks = [];
  
  // IHDR chunk
  chunks.push(createChunk('IHDR', ihdr));
  
  // IDAT chunk (compressed image data)
  chunks.push(createChunk('IDAT', compressed));
  
  // IEND chunk
  chunks.push(createChunk('IEND', Buffer.alloc(0)));
  
  // Combine all parts
  const png = Buffer.concat([PNG_SIGNATURE, ...chunks]);
  
  // Write to file
  const outputPath = path.join(__dirname, '..', 'icon.png');
  fs.writeFileSync(outputPath, png);
  
  console.log(`✅ Created icon.png (${width}x${height}) at ${outputPath}`);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.concat([typeBuffer, data]);
  
  // Calculate CRC
  const crc = calculateCRC(chunk);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, chunk, crcBuffer]);
}

function calculateCRC(data) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc ^ 0xFFFFFFFF;
}

// Run the icon creator
createIcon();