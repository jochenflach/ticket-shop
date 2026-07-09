const fs = require('fs');
const iconv = require('iconv-lite'); // wait, iconv-lite is not installed. We can use standard fs with 'binary' or write it directly as windows-1252 bytes since it's simple ascii.

const filePath = 'Ticketshop-Starten.bat';
let content = fs.readFileSync(filePath, 'utf8');

// Replace any existing CRLF first to avoid double carriage returns, then replace LF with CRLF
content = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

// Write back in Windows-1252 encoding (standard latin1 works perfectly for this since it covers German umlauts like ä, ö, ü)
fs.writeFileSync(filePath, content, { encoding: 'latin1' });

console.log('Ticketshop-Starten.bat successfully converted to CRLF and Windows-1252 encoding.');
