#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX   = 'f4f4000e34792d3bc70f820891d97efef45d709c3ebd9048ff323fa63f518677';
const KEY       = Buffer.from(KEY_HEX, 'hex');
const SRC  = process.argv[2] || path.join(__dirname, '..', 'build', 'aprs-tracker.html');
const DEST = process.argv[3] || path.join(__dirname, '..', 'build', 'aprs-tracker.html.enc');

const plaintext = fs.readFileSync(SRC);
const iv        = crypto.randomBytes(16);
const cipher    = crypto.createCipheriv(ALGORITHM, KEY, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag   = cipher.getAuthTag();

const ivLen  = Buffer.alloc(2); ivLen.writeUInt16BE(iv.length);
const tagLen = Buffer.alloc(2); tagLen.writeUInt16BE(authTag.length);
const output = Buffer.concat([ivLen, iv, tagLen, authTag, encrypted]);

fs.writeFileSync(DEST, output);
console.log(`[encrypt-html] ${path.basename(SRC)} → ${path.basename(DEST)}`);
console.log(`[encrypt-html] ${plaintext.length.toLocaleString()}b plaintext → ${output.length.toLocaleString()}b encrypted`);
console.log(`[encrypt-html] AES-256-GCM, IV=${iv.toString('hex').slice(0,16)}...`);
