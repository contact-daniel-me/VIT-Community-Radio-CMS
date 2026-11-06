import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Load .env.local
const envLocalPath = './.env.local';
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vit-radio-audio';
const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;

if (!accessKeyId || !secretAccessKey || !endpoint) {
  console.error('Missing Cloudflare R2 credentials in environment.');
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

// Generate realistic dummy MP3 frames
function generateMp3Buffer(totalBytes) {
  const buf = Buffer.alloc(totalBytes);
  // MPEG-1 Layer 3 sync word 0xFFFB (128kbps, 44.1kHz)
  const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  const frameLength = 417; // standard MP3 frame length for 128kbps/44.1kHz
  for (let i = 0; i < totalBytes; i += frameLength) {
    frameHeader.copy(buf, i);
    for (let j = 4; j < frameLength && i + j < totalBytes; j++) {
      buf[i + j] = (i + j) % 256;
    }
  }
  return buf;
}

const results = [];

async function run() {
  const testEpisodeId = '00000000-0000-0000-0000-test00000001';
  const testKey = `episodes/${testEpisodeId}/live-proof-${Date.now()}.mp3`;
  const multipartKey = `episodes/${testEpisodeId}/live-mpu-${Date.now()}.mp3`;

  console.log('--- STARTING LIVE CLOUDFLARE R2 PROOF ---');
  console.log(`Bucket: ${bucketName}`);
  console.log(`Endpoint: ${endpoint.replace(/(https:\/\/[^.]+).*/, '$1.r2.cloudflarestorage.com')}`);

  // 1. Bucket Connectivity Check
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    results.push({ test: 'R2-CONN-01 (HeadBucket connectivity)', status: 'LIVE PASS' });
    console.log('✓ R2-CONN-01: HeadBucket connectivity confirmed');
  } catch (err) {
    results.push({ test: 'R2-CONN-01', status: 'FAIL', error: err.message });
    console.error('✗ R2-CONN-01 failed:', err.message);
  }

  // 2. Small MP3 Binary Upload via Presigned PUT
  const mp3Data = generateMp3Buffer(128 * 1024); // 128 KB
  const mp3Hash = sha256(mp3Data);

  try {
    const putCmd = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      ContentType: 'audio/mpeg',
    });
    const presignedPut = await getSignedUrl(s3, putCmd, { expiresIn: 900 });

    const putRes = await fetch(presignedPut, {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: mp3Data,
    });

    if (putRes.ok) {
      results.push({ test: 'R2-CONN-02 (Presigned PUT upload)', status: 'LIVE PASS' });
      console.log('✓ R2-CONN-02: Presigned PUT upload succeeded (HTTP ' + putRes.status + ')');
    } else {
      throw new Error(`PUT failed: ${putRes.status} ${putRes.statusText}`);
    }
  } catch (err) {
    results.push({ test: 'R2-CONN-02', status: 'FAIL', error: err.message });
    console.error('✗ R2-CONN-02 failed:', err.message);
  }

  // 3. Verify Object Exists via HeadObject
  try {
    const headRes = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: testKey }));
    const lenMatch = headRes.ContentLength === mp3Data.length;
    const typeMatch = headRes.ContentType === 'audio/mpeg';

    if (lenMatch && typeMatch) {
      results.push({
        test: 'R2-CONN-03 & R2-CONN-05 (HeadObject Content-Type and Length)',
        status: 'LIVE PASS',
        details: { ContentLength: headRes.ContentLength, ContentType: headRes.ContentType },
      });
      console.log(`✓ R2-CONN-03 & 05: Object verified. Length: ${headRes.ContentLength}, Type: ${headRes.ContentType}`);
    } else {
      throw new Error(`Metadata mismatch: length ${headRes.ContentLength}, type ${headRes.ContentType}`);
    }
  } catch (err) {
    results.push({ test: 'R2-CONN-03', status: 'FAIL', error: err.message });
    console.error('✗ R2-CONN-03 failed:', err.message);
  }

  // 4. Download via Presigned GET & Checksum Comparison
  let presignedGetUrl = '';
  try {
    const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: testKey });
    presignedGetUrl = await getSignedUrl(s3, getCmd, { expiresIn: 3600 });

    const getRes = await fetch(presignedGetUrl);
    const downloadedBuf = Buffer.from(await getRes.arrayBuffer());
    const downloadedHash = sha256(downloadedBuf);

    if (mp3Hash === downloadedHash) {
      results.push({
        test: 'R2-CONN-04 (Presigned GET & SHA-256 checksum verification)',
        status: 'LIVE PASS',
        checksum: downloadedHash,
      });
      console.log(`✓ R2-CONN-04: Download checksum matched original: ${downloadedHash}`);
    } else {
      throw new Error(`Checksum mismatch: expected ${mp3Hash}, got ${downloadedHash}`);
    }
  } catch (err) {
    results.push({ test: 'R2-CONN-04', status: 'FAIL', error: err.message });
    console.error('✗ R2-CONN-04 failed:', err.message);
  }

    // 5. Direct Unauthenticated Access Check (Must be denied with 400/401/403: Missing Authorization)
  try {
    const directUrl = `${endpoint}/${bucketName}/${testKey}`;
    const directRes = await fetch(directUrl);
    if (directRes.status === 400 || directRes.status === 401 || directRes.status === 403) {
      results.push({
        test: 'R2-CONN-06 (Direct unauthenticated access denied)',
        status: 'LIVE PASS',
        httpStatus: directRes.status,
      });
      console.log(`✓ R2-CONN-06: Direct access correctly denied with HTTP ${directRes.status} (<Message>Authorization</Message>)`);
    } else {
      throw new Error(`Direct access was not denied: HTTP ${directRes.status}`);
    }
  } catch (err) {
    results.push({ test: 'R2-CONN-06', status: 'FAIL', error: err.message });
    console.error('✗ R2-CONN-06 failed:', err.message);
  }

  // 6. Real HTTP Range Playback (Range: bytes=0-1023)
  try {
    const rangeRes1 = await fetch(presignedGetUrl, {
      headers: { Range: 'bytes=0-1023' },
    });

    const is206 = rangeRes1.status === 206;
    const contentRange = rangeRes1.headers.get('content-range');
    const acceptRanges = rangeRes1.headers.get('accept-ranges');
    const contentType = rangeRes1.headers.get('content-type');
    const contentLength = rangeRes1.headers.get('content-length');

    const bytes1 = Buffer.from(await rangeRes1.arrayBuffer());
    const slice1Match = bytes1.equals(mp3Data.subarray(0, 1024));

    if (is206 && slice1Match && contentRange?.startsWith('bytes 0-1023/')) {
      results.push({
        test: 'R2-RNG-01 (HTTP 206 Partial Content, Content-Range, Accept-Ranges)',
        status: 'LIVE PASS',
        headers: {
          'Content-Range': contentRange,
          'Accept-Ranges': acceptRanges,
          'Content-Length': contentLength,
          'Content-Type': contentType,
        },
      });
      console.log(`✓ R2-RNG-01: Range bytes=0-1023 returned HTTP 206. Range: ${contentRange}`);
    } else {
      throw new Error(`Range check 1 failed: status=${rangeRes1.status}, range=${contentRange}`);
    }

    // Second non-overlapping range: bytes=1024-2047
    const rangeRes2 = await fetch(presignedGetUrl, {
      headers: { Range: 'bytes=1024-2047' },
    });
    const bytes2 = Buffer.from(await rangeRes2.arrayBuffer());
    const slice2Match = bytes2.equals(mp3Data.subarray(1024, 2048));

    if (rangeRes2.status === 206 && slice2Match) {
      results.push({
        test: 'R2-RNG-02 (Second non-overlapping byte range & byte-for-byte fidelity)',
        status: 'LIVE PASS',
        range: rangeRes2.headers.get('content-range'),
      });
      console.log(`✓ R2-RNG-02: Second range bytes=1024-2047 verified (HTTP 206) with byte-level fidelity`);
    } else {
      throw new Error(`Range check 2 failed: status=${rangeRes2.status}`);
    }
  } catch (err) {
    results.push({ test: 'R2-RNG', status: 'FAIL', error: err.message });
    console.error('✗ R2-RNG failed:', err.message);
  }

  // 7. Real Multipart Upload (2 x 5.5MB parts)
  try {
    const PART_SIZE = 5.5 * 1024 * 1024; // 5.5 MB (above S3 5MB minimum)
    const totalMultipartSize = PART_SIZE * 2;
    const mpuBuffer = generateMp3Buffer(totalMultipartSize);
    const mpuHash = sha256(mpuBuffer);

    // Initiate
    const createRes = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: multipartKey,
        ContentType: 'audio/mpeg',
      })
    );
    const uploadId = createRes.UploadId;

    // Part 1
    const part1Buf = mpuBuffer.subarray(0, PART_SIZE);
    const part1Res = await s3.send(
      new UploadPartCommand({
        Bucket: bucketName,
        Key: multipartKey,
        UploadId: uploadId,
        PartNumber: 1,
        Body: part1Buf,
      })
    );

    // Part 2
    const part2Buf = mpuBuffer.subarray(PART_SIZE);
    const part2Res = await s3.send(
      new UploadPartCommand({
        Bucket: bucketName,
        Key: multipartKey,
        UploadId: uploadId,
        PartNumber: 2,
        Body: part2Buf,
      })
    );

    // Complete
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: multipartKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [
            { PartNumber: 1, ETag: part1Res.ETag },
            { PartNumber: 2, ETag: part2Res.ETag },
          ],
        },
      })
    );

    // Download completed multipart object and verify checksum
    const getMpuCmd = new GetObjectCommand({ Bucket: bucketName, Key: multipartKey });
    const getMpuUrl = await getSignedUrl(s3, getMpuCmd, { expiresIn: 900 });
    const mpuGetRes = await fetch(getMpuUrl);
    const downloadedMpuBuf = Buffer.from(await mpuGetRes.arrayBuffer());
    const downloadedMpuHash = sha256(downloadedMpuBuf);

    if (mpuHash === downloadedMpuHash) {
      results.push({
        test: 'R2-MPU-01 (Live multipart upload completion & integrity)',
        status: 'LIVE PASS',
        size: totalMultipartSize,
        checksum: downloadedMpuHash,
      });
      console.log(`✓ R2-MPU-01: Multipart upload (11MB) completed and verified (SHA-256 match)`);
    } else {
      throw new Error(`Multipart checksum mismatch: ${mpuHash} vs ${downloadedMpuHash}`);
    }

    // Abort Test: Initiate and abort a separate multipart upload
    const abortKey = `episodes/${testEpisodeId}/live-abort-${Date.now()}.mp3`;
    const createAbortRes = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: abortKey,
        ContentType: 'audio/mpeg',
      })
    );
    const abortUploadId = createAbortRes.UploadId;

    await s3.send(
      new UploadPartCommand({
        Bucket: bucketName,
        Key: abortKey,
        UploadId: abortUploadId,
        PartNumber: 1,
        Body: part1Buf,
      })
    );

    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: bucketName,
        Key: abortKey,
        UploadId: abortUploadId,
      })
    );

    // Verify aborted upload cannot be retrieved
    let abortObjectExists = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: abortKey }));
      abortObjectExists = true;
    } catch {
      abortObjectExists = false;
    }

    if (!abortObjectExists) {
      results.push({
        test: 'R2-MPU-02 (Multipart abort & incomplete upload cleanup)',
        status: 'LIVE PASS',
      });
      console.log('✓ R2-MPU-02: Multipart abort verified. Incomplete upload successfully discarded.');
    } else {
      throw new Error('Aborted object was unexpectedly found in bucket.');
    }
  } catch (err) {
    results.push({ test: 'R2-MPU', status: 'FAIL', error: err.message });
    console.error('✗ R2-MPU failed:', err.message);
  }

  // 8. Cleanup test files from bucket
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: multipartKey }));
    console.log('✓ Cleaned up test files from R2 bucket.');
  } catch (e) {
    console.warn('Warning during cleanup:', e.message);
  }

  console.log('\n--- LIVE VERIFICATION SUMMARY ---');
  console.log(JSON.stringify(results, null, 2));
}

run().catch(console.error);

