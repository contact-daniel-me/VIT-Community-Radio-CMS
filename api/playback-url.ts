import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vit-radio-media';
const endpoint =
  process.env.CLOUDFLARE_R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

let s3: S3Client | null = null;
if (accessKeyId && secretAccessKey && endpoint) {
  s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Public playback audio gateway.
 * Allows anonymous listeners to stream full broadcast episodes without requiring a login session.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const storagePath = req.query.path as string;
  const expiresInSeconds = Math.min(
    Math.max(parseInt(req.query.expires as string, 10) || 3600, 60),
    86400,
  );

  if (!storagePath || typeof storagePath !== 'string' || !storagePath.startsWith('episodes/')) {
    return res.status(400).json({ error: 'Invalid or missing storagePath.' });
  }

  try {
    if (!s3) {
      return res.status(500).json({ error: 'R2 storage credentials not configured on server.' });
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
    });

    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });

    return res.status(200).json({
      downloadUrl,
      storagePath,
      expiresIn: expiresInSeconds,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}
