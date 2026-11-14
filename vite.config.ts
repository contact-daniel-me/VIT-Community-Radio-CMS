import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const accessKeyId = env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucketName = env.CLOUDFLARE_R2_BUCKET_NAME || 'vit-radio-media';
  const endpoint =
    env.CLOUDFLARE_R2_ENDPOINT ||
    (env.CLOUDFLARE_ACCOUNT_ID
      ? `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined);

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

  return {
    plugins: [
      react(),
      {
        name: 'r2-playback-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && req.url.startsWith('/api/playback-url')) {
              try {
                const parsedUrl = new URL(req.url, 'http://localhost');
                const storagePath = parsedUrl.searchParams.get('path');
                const expires = parseInt(parsedUrl.searchParams.get('expires') || '3600', 10);

                if (!storagePath || !storagePath.startsWith('episodes/')) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Invalid or missing storagePath.' }));
                  return;
                }

                if (!s3) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'R2 credentials not found in env.' }));
                  return;
                }

                const cmd = new GetObjectCommand({
                  Bucket: bucketName,
                  Key: storagePath,
                });
                const downloadUrl = await getSignedUrl(s3, cmd, {
                  expiresIn: Math.min(Math.max(expires, 60), 86400),
                });

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ downloadUrl, storagePath }));
                return;
              } catch (e: unknown) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
                return;
              }
            }
            next();
          });
        },
      },
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { host: true, port: 5173 },
    test: {
      include: ['tests/specs/**/*.spec.ts'],
      testTimeout: 120_000,
      hookTimeout: 120_000,
      pool: 'forks',
      fileParallelism: false,
    },
  };
});
