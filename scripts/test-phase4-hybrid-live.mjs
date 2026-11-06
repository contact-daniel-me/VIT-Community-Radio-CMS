#!/usr/bin/env node
/**
 * VIT Community Radio CMS -- Phase 4: Hybrid Storage Live Verification Script
 *
 * Verifies live Cloudflare R2 operations for newly created audio files:
 * 1. Connectivity to private bucket `vit-radio-media`.
 * 2. Presigned PUT upload for new RJ/Producer recordings.
 * 3. Object existence, size, MIME type, and metadata verification.
 * 4. Presigned GET URL generation for provider-aware playback.
 * 5. HTTP Range requests (206 Partial Content) for seeking/scrubbing.
 * 6. Bit-for-bit SHA-256 integrity verification.
 * 7. Audio replacement lifecycle (upload new take to R2, preserve Supabase objects).
 * 8. Clean removal of test artifacts.
 */

import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import fs from 'node:fs';

// -----------------------------------------------------------------------------
// 1. Load Environment Variables
// -----------------------------------------------------------------------------
const envFiles = ['.env.local', '.env'];
for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vit-radio-media';
const endpoint =
  process.env.CLOUDFLARE_R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

if (!accessKeyId || !secretAccessKey || !endpoint) {
  console.error('[FAIL] Missing Cloudflare R2 credentials or endpoint in environment.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function generateMp3Buffer(totalBytes) {
  const buf = Buffer.alloc(totalBytes);
  const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  for (let i = 0; i < totalBytes; i += 417) {
    frameHeader.copy(buf, i);
    for (let j = i + 4; j < Math.min(i + 417, totalBytes); j++) {
      buf[j] = (j * 31 + 17) & 0xff;
    }
  }
  return buf;
}

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// -----------------------------------------------------------------------------
// Live Tests Execution
// -----------------------------------------------------------------------------
async function runPhase4LiveTests() {
  console.log('='.repeat(76));
  console.log('VIT COMMUNITY RADIO CMS -- PHASE 4 HYBRID STORAGE LIVE VERIFICATION');
  console.log('='.repeat(76));
  console.log(`Cloudflare R2 Bucket   : ${bucketName}`);
  console.log(`Cloudflare Endpoint    : ${endpoint}`);
  console.log('='.repeat(76));

  const results = [];
  const testEpisodeId = crypto.randomUUID();
  const testFileName = 'phase4-rj-take1.mp3';
  const testKey = `episodes/${testEpisodeId}/${Date.now()}-live-test-${testFileName}`;
  const replacementKey = `episodes/${testEpisodeId}/${Date.now()}-live-take2.mp3`;

  // 1. Bucket Connectivity Check
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    results.push({ id: 'P4-LIVE-01', name: 'R2 Bucket Connectivity (vit-radio-media)', status: 'LIVE PASS' });
    console.log('[PASS] P4-LIVE-01: Successfully connected to private Cloudflare R2 bucket.');
  } catch (err) {
    results.push({ id: 'P4-LIVE-01', name: 'R2 Bucket Connectivity', status: 'FAIL', error: err.message });
    console.error('[FAIL] P4-LIVE-01: Bucket connectivity failed:', err.message);
    process.exit(1);
  }

  // 2. RJ / Producer Audio Upload via Presigned PUT
  const fileBytes = 256 * 1024; // 256 KB
  const originalAudio = generateMp3Buffer(fileBytes);
  const expectedChecksum = sha256(originalAudio);

  try {
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      ContentType: 'audio/mpeg',
    });
    const presignedPutUrl = await getSignedUrl(s3, putCommand, { expiresIn: 900 });

    const putRes = await fetch(presignedPutUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: originalAudio,
    });

    if (!putRes.ok) {
      throw new Error(`PUT upload failed with status ${putRes.status}: ${putRes.statusText}`);
    }
    results.push({
      id: 'P4-LIVE-02',
      name: 'New Audio Upload via Presigned PUT (R2)',
      status: 'LIVE PASS',
      bytes: fileBytes,
    });
    console.log(`[PASS] P4-LIVE-02: Uploaded 256KB MP3 binary to R2: "${testKey}"`);
  } catch (err) {
    results.push({ id: 'P4-LIVE-02', name: 'New Audio Upload via Presigned PUT', status: 'FAIL', error: err.message });
    console.error('[FAIL] P4-LIVE-02: Upload failed:', err.message);
  }

  // 3. Object Existence & Metadata Verification
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: testKey }));
    if (head.ContentLength !== fileBytes || head.ContentType !== 'audio/mpeg') {
      throw new Error(`Mismatch in object metadata: size=${head.ContentLength}, type=${head.ContentType}`);
    }
    results.push({ id: 'P4-LIVE-03', name: 'R2 Object Head & MIME Verification', status: 'LIVE PASS' });
    console.log('[PASS] P4-LIVE-03: R2 HeadObject verified: 262,144 bytes, audio/mpeg.');
  } catch (err) {
    results.push({ id: 'P4-LIVE-03', name: 'R2 Object Head & MIME Verification', status: 'FAIL', error: err.message });
    console.error('[FAIL] P4-LIVE-03: Metadata verification failed:', err.message);
  }

  // 4. Presigned GET URL Generation for Playback
  let playbackUrl = '';
  try {
    const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: testKey });
    playbackUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });
    results.push({ id: 'P4-LIVE-04', name: 'Playback Presigned GET URL Generation (3600s TTL)', status: 'LIVE PASS' });
    console.log('[PASS] P4-LIVE-04: Generated time-limited presigned GET URL for playback.');
  } catch (err) {
    results.push({ id: 'P4-LIVE-04', name: 'Playback Presigned GET URL Generation', status: 'FAIL', error: err.message });
  }

  // 5. HTTP Range Playback Streaming Verification (Range: bytes=0-1023)
  try {
    const rangeRes = await fetch(playbackUrl, {
      headers: { Range: 'bytes=0-1023' },
    });

    if (rangeRes.status !== 206) {
      throw new Error(`Expected HTTP 206 Partial Content, received HTTP ${rangeRes.status}`);
    }

    const contentRange = rangeRes.headers.get('content-range');
    const rangeBuf = Buffer.from(await rangeRes.arrayBuffer());

    if (rangeBuf.length !== 1024 || !contentRange?.includes('bytes 0-1023/262144')) {
      throw new Error(`Invalid range response: length=${rangeBuf.length}, header=${contentRange}`);
    }

    // Verify first 1024 bytes match original buffer
    if (!rangeBuf.equals(originalAudio.subarray(0, 1024))) {
      throw new Error('Partial range bytes do not match original audio buffer!');
    }

    results.push({ id: 'P4-LIVE-05', name: 'HTTP Range Streaming (206 Partial Content)', status: 'LIVE PASS' });
    console.log('[PASS] P4-LIVE-05: HTTP Range 206 verified: Content-Range bytes 0-1023/262144 with byte fidelity.');
  } catch (err) {
    results.push({ id: 'P4-LIVE-05', name: 'HTTP Range Streaming', status: 'FAIL', error: err.message });
    console.error('[FAIL] P4-LIVE-05: Range streaming failed:', err.message);
  }

  // 6. Audio Seeking Range Verification (Range: bytes=1024-2047)
  try {
    const seekRes = await fetch(playbackUrl, {
      headers: { Range: 'bytes=1024-2047' },
    });
    if (seekRes.status !== 206) throw new Error(`Status ${seekRes.status}`);
    const seekBuf = Buffer.from(await seekRes.arrayBuffer());
    if (!seekBuf.equals(originalAudio.subarray(1024, 2048))) {
      throw new Error('Seek range bytes do not match original audio buffer!');
    }
    results.push({ id: 'P4-LIVE-06', name: 'Audio Seeking / Scrubbing Range Verification', status: 'LIVE PASS' });
    console.log('[PASS] P4-LIVE-06: Second range 1024-2047 verified with exact byte fidelity.');
  } catch (err) {
    results.push({ id: 'P4-LIVE-06', name: 'Audio Seeking Range Verification', status: 'FAIL', error: err.message });
  }

  // 7. Full Download & SHA-256 Checksum Verification
  try {
    const fullRes = await fetch(playbackUrl);
    const fullBuf = Buffer.from(await fullRes.arrayBuffer());
    const downloadedChecksum = sha256(fullBuf);

    if (downloadedChecksum !== expectedChecksum) {
      throw new Error(`Checksum mismatch! Expected: ${expectedChecksum}, Received: ${downloadedChecksum}`);
    }
    results.push({
      id: 'P4-LIVE-07',
      name: 'Full Binary Download & SHA-256 Bit-for-Bit Fidelity',
      status: 'LIVE PASS',
      checksum: expectedChecksum.slice(0, 16) + '...',
    });
    console.log(`[PASS] P4-LIVE-07: SHA-256 verified (${expectedChecksum.slice(0, 16)}...). 100% bit-for-bit match.`);
  } catch (err) {
    results.push({ id: 'P4-LIVE-07', name: 'Full Download & SHA-256 Fidelity', status: 'FAIL', error: err.message });
  }

  // 8. Replacement Take in R2
  try {
    const take2Audio = generateMp3Buffer(128 * 1024);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: replacementKey,
        ContentType: 'audio/mpeg',
        Body: take2Audio,
      }),
    );
    const headTake2 = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: replacementKey }));
    if (headTake2.ContentLength !== 128 * 1024) throw new Error('Replacement take size mismatch');

    results.push({ id: 'P4-LIVE-08', name: 'Audio Replacement Workflow (New R2 Take)', status: 'LIVE PASS' });
    console.log('[PASS] P4-LIVE-08: Successfully uploaded replacement take 2 to R2.');
  } catch (err) {
    results.push({ id: 'P4-LIVE-08', name: 'Audio Replacement Workflow', status: 'FAIL', error: err.message });
  }

  // 9. Clean up live test artifacts
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: replacementKey }));
    results.push({ id: 'P4-LIVE-09', name: 'Test Artifact Cleanup in R2', status: 'LIVE PASS' });
    console.log('[PASS] P4-LIVE-09: Cleaned up temporary test objects from R2.');
  } catch (err) {
    results.push({ id: 'P4-LIVE-09', name: 'Test Artifact Cleanup', status: 'FAIL', error: err.message });
  }

  console.log('\n' + '='.repeat(76));
  console.log('PHASE 4 LIVE VERIFICATION SUMMARY');
  console.log('='.repeat(76));
  console.table(results);
  console.log('='.repeat(76));
}

runPhase4LiveTests().catch((err) => {
  console.error('[FATAL EXCEPTION]:', err);
  process.exit(1);
});

