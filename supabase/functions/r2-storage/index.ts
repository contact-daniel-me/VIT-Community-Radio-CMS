/**
-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- CLOUDFLARE R2 STORAGE GATEWAY
-- Supabase Edge Function: r2-storage
--
-- Secure server-side gateway to Cloudflare R2 object storage.
-- All R2 credentials remain exclusively server-side.
-- Validates Supabase JWT authentication and user episode permissions before
-- issuing short-lived presigned upload and download URLs.
--
-- Canonical object key format:
--   episodes/{episode_id}/{timestamp}-{random}-{filename}
-- =============================================================================
*/

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';
import { FetchHttpHandler } from 'npm:@smithy/fetch-http-handler';

// Max audio size: 100 MB (matches database constraint)
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['audio/mpeg', 'audio/mp3'];

const ALLOWED_ORIGINS = [
  'https://vitradio.growiota.in',
  'https://mixota.growiota.in',
  'http://localhost:5173',
  'http://localhost:5055',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  let allowOrigin = '*';
  if (origin) {
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith('.growiota.in') ||
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost:')
    ) {
      allowOrigin = origin;
    }
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

function getR2Client(): S3Client {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
  const customEndpoint = Deno.env.get('CLOUDFLARE_R2_ENDPOINT');

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing Cloudflare R2 credentials in environment variables.');
  }

  let endpoint = customEndpoint?.trim() || (accountId ? `https://${accountId.trim()}.r2.cloudflarestorage.com` : '');
  if (!endpoint) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_R2_ENDPOINT.');
  }

  // Defensive normalization: strip trailing slashes or accidental bucket path suffix from endpoint
  endpoint = endpoint.replace(/\/+$/, '');
  const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || 'vit-radio-media';
  if (endpoint.endsWith(`/${bucketName}`)) {
    endpoint = endpoint.slice(0, -`/${bucketName}`.length);
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestHandler: new FetchHttpHandler({ keepAlive: false }),
  });
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80);
}

function generateCanonicalStoragePath(episodeId: string, fileName: string): string {
  const safe = sanitizeFileName(fileName);
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `episodes/${episodeId}/${Date.now()}-${randomSuffix}-${safe || 'audio.mp3'}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadEligibilityResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
}

async function checkUploadEligibility(
  profile: { id: string; role: string; active: boolean },
  episodeId: string,
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
): Promise<UploadEligibilityResult> {
  // 1. Operational Killswitch
  const rolloutPaused = Deno.env.get('R2_UPLOADS_PAUSED') === 'true';
  if (rolloutPaused) {
    return {
      allowed: false,
      error: 'New R2 audio uploads are temporarily paused by station operations.',
      statusCode: 503,
    };
  }

  // 2. Controlled Role Enablement
  const allowedRolesEnv = Deno.env.get('R2_ROLLOUT_ALLOWED_ROLES');
  if (allowedRolesEnv) {
    const allowedRoles = allowedRolesEnv.split(',').map((r: string) => r.trim().toUpperCase());
    if (!allowedRoles.includes(profile.role.toUpperCase())) {
      return {
        allowed: false,
        error: `R2 upload rollout is currently restricted. Role '${profile.role}' is not yet enabled.`,
        statusCode: 403,
      };
    }
  }

  // 3. Episode Ownership and Status Check
  const { data: episode, error: epError } = await supabaseAdmin
    .from('episodes')
    .select('id, status, created_by, assigned_rj')
    .eq('id', episodeId)
    .maybeSingle();

  if (epError || !episode) {
    return { allowed: false, error: 'Episode not found.', statusCode: 404 };
  }

  const role = profile.role;
  const isAdminOrProducer = role === 'ADMIN' || role === 'PRODUCER';
  const isOwnerRj = role === 'RJ' && (episode.created_by === profile.id || episode.assigned_rj === profile.id);
  const isDraftOrRejected = episode.status === 'DRAFT' || episode.status === 'REJECTED';

  if (!isAdminOrProducer && (!isOwnerRj || !isDraftOrRejected)) {
    return {
      allowed: false,
      error: 'You cannot upload audio for this episode. It may be locked for QC review.',
      statusCode: 403,
    };
  }

  return { allowed: true };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const errorResponse = (message: string, status = 400) => jsonResponse({ error: message }, status);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey;
    const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || 'vit-radio-media';

    // Use service client to safely inspect role and episode metadata
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Optional user authentication: extract profile if valid Bearer token provided
    const authHeader = req.headers.get('Authorization') || '';
    // deno-lint-ignore no-explicit-any
    let user: any = null;
    // deno-lint-ignore no-explicit-any
    let profile: any = null;

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: userData } = await supabaseUserClient.auth.getUser(token);
      if (userData?.user) {
        user = userData.user;
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('id, role, active')
          .eq('id', user.id)
          .maybeSingle();

        if (prof?.active) {
          profile = prof;
        }
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || '';

    const s3 = getR2Client();

    // -------------------------------------------------------------------------
    // ACTION: create-download-url (public approved playback or station members)
    // -------------------------------------------------------------------------
    if (action === 'create-download-url') {
      const { storagePath, expiresInSeconds = 3600 } = body;

      if (!storagePath || typeof storagePath !== 'string' || !storagePath.startsWith('episodes/')) {
        return errorResponse('Invalid storagePath: must follow canonical episodes/{episodeId}/... format.');
      }

      // Check access permission:
      // A. Station members with active role can listen to review/schedule audio
      // B. Public listeners can stream any approved published broadcast episode
      let isAllowed = Boolean(profile?.role);

      if (!isAllowed) {
        const { data: publicEp } = await supabaseAdmin
          .from('v_public_approved_episodes')
          .select('episode_id')
          .eq('storage_path', storagePath)
          .maybeSingle();

        if (publicEp) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return errorResponse('Forbidden: Station role required or episode is not published.', 403);
      }

      const expiry = Math.min(Math.max(expiresInSeconds, 60), 86400); // between 1 min and 24 hours

      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: storagePath,
      });

      const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: expiry });

      return jsonResponse({
        downloadUrl,
        storagePath,
        expiresIn: expiry,
      });
    }

    // All subsequent actions (upload, delete, multipart) require an authenticated active station member
    if (!profile || !profile.active) {
      return errorResponse('Unauthorized: Valid active station profile required.', 401);
    }

    // -------------------------------------------------------------------------
    // ACTION: create-upload-url
    // -------------------------------------------------------------------------
    if (action === 'create-upload-url') {
      const { episodeId, fileName, mimeType, fileSize, targetField = 'audio_file_id' } = body;

      if (!episodeId || !UUID_REGEX.test(episodeId)) {
        return errorResponse('Valid episodeId is required.');
      }
      if (!fileName || typeof fileName !== 'string' || !fileName.toLowerCase().endsWith('.mp3')) {
        return errorResponse('Only MP3 files (.mp3) are permitted.');
      }
      if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
        return errorResponse(`Invalid MIME type: ${mimeType}. Only audio/mpeg or audio/mp3 accepted.`);
      }
      if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0 || fileSize > MAX_AUDIO_BYTES) {
        return errorResponse(
          `File size exceeds the 100 MB upload limit. Please upload an audio file smaller than or equal to 100 MB. (File size must be between 1 byte and ${MAX_AUDIO_BYTES} bytes).`,
        );
      }

      // Controlled Rollout & Authorization Check
      const check = await checkUploadEligibility(profile, episodeId, supabaseAdmin);
      if (!check.allowed) {
        return errorResponse(check.error || 'Upload not allowed.', check.statusCode || 403);
      }

      // Generate canonical storage path: episodes/{episodeId}/{timestamp}-{random}-{filename}
      const storagePath = generateCanonicalStoragePath(episodeId, fileName);
      const expiresIn = 900; // 15 minutes

      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: storagePath,
        ContentType: mimeType,
      });

      const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn });

      return jsonResponse({
        uploadUrl,
        storagePath,
        storageProvider: 'r2',
        expiresIn,
        targetField,
      });
    }



    // -------------------------------------------------------------------------
    // ACTION: initiate-multipart-upload
    // -------------------------------------------------------------------------
    if (action === 'initiate-multipart-upload') {
      const { episodeId, fileName, mimeType } = body;

      if (!episodeId || !UUID_REGEX.test(episodeId)) return errorResponse('Valid episodeId is required.');
      if (!fileName || !fileName.toLowerCase().endsWith('.mp3')) return errorResponse('Only MP3 files are permitted.');

      // Controlled Rollout & Authorization Check
      const check = await checkUploadEligibility(profile, episodeId, supabaseAdmin);
      if (!check.allowed) {
        return errorResponse(check.error || 'Upload not allowed.', check.statusCode || 403);
      }

      const storagePath = generateCanonicalStoragePath(episodeId, fileName);
      const command = new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: storagePath,
        ContentType: mimeType || 'audio/mpeg',
      });

      const res = await s3.send(command);

      return jsonResponse({
        uploadId: res.UploadId,
        storagePath,
        storageProvider: 'r2',
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: create-part-upload-url
    // -------------------------------------------------------------------------
    if (action === 'create-part-upload-url') {
      const { storagePath, uploadId, partNumber } = body;

      if (!storagePath || !uploadId || !partNumber) {
        return errorResponse('storagePath, uploadId, and partNumber are required.');
      }

      const command = new UploadPartCommand({
        Bucket: bucketName,
        Key: storagePath,
        UploadId: uploadId,
        PartNumber: Number(partNumber),
      });

      const partUploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

      return jsonResponse({ partUploadUrl, partNumber });
    }

    // -------------------------------------------------------------------------
    // ACTION: complete-multipart-upload
    // -------------------------------------------------------------------------
    if (action === 'complete-multipart-upload') {
      const { storagePath, uploadId, parts } = body;

      if (!storagePath || !uploadId || !Array.isArray(parts)) {
        return errorResponse('storagePath, uploadId, and parts array are required.');
      }

      const formattedParts = (parts as Array<{ PartNumber: number | string; ETag: string }>)
        .map((p) => ({
          PartNumber: Number(p.PartNumber),
          ETag: String(p.ETag).startsWith('"') ? String(p.ETag) : `"${p.ETag}"`,
        }))
        .sort((a, b) => a.PartNumber - b.PartNumber);

      const command = new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: storagePath,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: formattedParts,
        },
      });

      const res = await s3.send(command);

      return jsonResponse({
        success: true,
        storagePath,
        location: res.Location,
        storageProvider: 'r2',
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: abort-multipart-upload
    // -------------------------------------------------------------------------
    if (action === 'abort-multipart-upload') {
      const { storagePath, uploadId } = body;

      if (!storagePath || !uploadId) {
        return errorResponse('storagePath and uploadId are required.');
      }

      const command = new AbortMultipartUploadCommand({
        Bucket: bucketName,
        Key: storagePath,
        UploadId: uploadId,
      });

      await s3.send(command);

      return jsonResponse({ aborted: true, storagePath });
    }

    // -------------------------------------------------------------------------
    // ACTION: delete-object
    // -------------------------------------------------------------------------
    if (action === 'delete-object') {
      const { storagePath, episodeId } = body;

      if (!storagePath || !storagePath.startsWith('episodes/')) {
        return errorResponse('Valid storagePath required.');
      }

      // Check episode permission
      if (episodeId && UUID_REGEX.test(episodeId)) {
        const { data: episode } = await supabaseAdmin
          .from('episodes')
          .select('status, created_by, assigned_rj')
          .eq('id', episodeId)
          .maybeSingle();

        const isAdminOrProducer = profile.role === 'ADMIN' || profile.role === 'PRODUCER';
        const isOwnerRj = profile.role === 'RJ' && (episode?.created_by === profile.id || episode?.assigned_rj === profile.id);
        const isDraftOrRejected = episode?.status === 'DRAFT' || episode?.status === 'REJECTED';

        if (!isAdminOrProducer && (!isOwnerRj || !isDraftOrRejected)) {
          return errorResponse('Permission denied to delete audio for this episode.', 403);
        }
      } else if (profile.role !== 'ADMIN') {
        return errorResponse('Admin permission required to delete audio without episode reference.', 403);
      }

      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: storagePath,
      });

      await s3.send(command);

      return jsonResponse({ deleted: true, storagePath });
    }

    return errorResponse(`Unknown action: ${action}`, 400);
  } catch (err) {
    console.error('[r2-storage error]', err);
    return errorResponse((err as Error).message || 'Internal server error', 500);
  }
});

