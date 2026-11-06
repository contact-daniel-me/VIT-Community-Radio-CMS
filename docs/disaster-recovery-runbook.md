# VIT Community Radio 90.8 FM CMS — Disaster Recovery & Operational Runbook

**Target Production Project**: `qqoybhevvnkycepujosm` (`contact-daniel-me's Project` · Singapore / `ap-southeast-1`)  
**Cloudflare R2 Bucket**: `vit-radio-media` (Account: `84ae261d6f560a1385b41271db5e2a40`, Private)  
**Gateway Edge Function**: `https://qqoybhevvnkycepujosm.supabase.co/functions/v1/r2-storage`  
**Baseline Git Commit**: `71ddb25` (Pre-hybrid storage deployment)

---

## 1. Architecture Overview & Safety Constraints

The CMS operates in a hybrid storage topology:
1. **Supabase Storage (`radio-audio`)**: Holds the **55 historical audio recordings** (~491.5 MB). These are read-only and immutable. **Never migrate or delete these files.**
2. **Cloudflare R2 (`vit-radio-media`)**: Stores all newly recorded and uploaded audio takes. Egress is free ($0.00/GB).
3. **Decoupled Architecture**: Upload gating and controls (`R2_UPLOADS_PAUSED`, `R2_ROLLOUT_ALLOWED_ROLES`) only gate **presigned PUT upload token generation**. **Playback of all existing audio (R2 and Supabase) remains online even during upload pauses.**

---

## 2. Emergency Operational Controls (Killswitch & Role Gating)

### 2.1 Pausing New R2 Uploads (Killswitch)
If the R2 gateway experiences upstream issues, errors, or under maintenance:

```bash
# Set R2_UPLOADS_PAUSED in Supabase Secrets
npx supabase secrets set R2_UPLOADS_PAUSED=true --project-ref qqoybhevvnkycepujosm
```
- **Effect**: All `create-upload-url` requests fail immediately with `HTTP 503 Service Unavailable ("R2 uploads temporarily paused by operator")`.
- **Playback Impact**: **Zero**. Existing episodes on both Supabase and R2 continue playing normally.
- **Frontend Behavior**: The Admin dashboard Storage Health section displays a prominent yellow banner: `Gateway Paused`.

### 2.2 Resuming New Uploads
```bash
npx supabase secrets set R2_UPLOADS_PAUSED=false --project-ref qqoybhevvnkycepujosm
```

### 2.3 Restricting Uploads to Specific Roles (Gradual Rollout)
```bash
# Allow only ADMIN and PRODUCER to upload new audio to R2:
npx supabase secrets set R2_ROLLOUT_ALLOWED_ROLES="ADMIN,PRODUCER" --project-ref qqoybhevvnkycepujosm

# Expand to all roles (default):
npx supabase secrets set R2_ROLLOUT_ALLOWED_ROLES="ADMIN,PRODUCER,RJ,EDITOR" --project-ref qqoybhevvnkycepujosm
```

---

## 3. Disaster Scenarios & Recovery Procedures

### Scenario A: R2 Gateway Function Downtime or Crash
**Symptoms**: Uploads fail with HTTP 500 or timeout; dashboard indicates Gateway Error Rate > 10%.

**Recovery Steps**:
1. Check function logs:
   ```bash
   npx supabase functions logs --project-ref qqoybhevvnkycepujosm
   ```
2. Re-deploy the verified edge function bundle:
   ```bash
   npx supabase functions deploy r2-storage --no-verify-jwt=false --project-ref qqoybhevvnkycepujosm
   ```
3. Run gateway diagnostic:
   ```bash
   node scripts/test-phase4-hybrid-live.mjs
   ```

---

### Scenario B: Cloudflare R2 Credential Rotation
**Symptoms**: Security leak alert or scheduled key rotation.

**Procedure (Zero-Downtime)**:
1. In Cloudflare Dashboard &rarr; **R2** &rarr; **Manage R2 API Tokens**, create a new token with **Object Read & Write** permissions scoped to `vit-radio-media`.
2. Update production secrets in Supabase:
   ```bash
   npx supabase secrets set \
     CLOUDFLARE_R2_ACCESS_KEY_ID="<NEW_ACCESS_KEY_ID>" \
     CLOUDFLARE_R2_SECRET_ACCESS_KEY="<NEW_SECRET_ACCESS_KEY>" \
     --project-ref qqoybhevvnkycepujosm
   ```
3. Update `.env.local` for local operational scripts:
   ```bash
   # Update CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY
   ```
4. Test bucket connectivity immediately:
   ```bash
   node scripts/verify-storage-integrity.mjs
   ```
5. Once verified, revoke the old API token in Cloudflare Dashboard.

---

### Scenario C: Single-Episode Rollback (R2 to Supabase)
If an individual episode's audio must be restored to Supabase:

**Procedure**:
1. Verify that the destination object actually exists in Supabase Storage.
2. Use `src/services/storageRollbackService.ts`:
   ```typescript
   import { storageRollbackService } from '@/services/storageRollbackService';

   // Dry-run first:
   const preview = await storageRollbackService.rollbackEpisode({
     episodeId: '<EPISODE_ID>',
     dryRun: true,
   });
   console.log(preview);

   // Execute verified rollback:
   const result = await storageRollbackService.rollbackEpisode({
     episodeId: '<EPISODE_ID>',
     dryRun: false,
   });
   ```
3. **Safety Guarantee**: `storageRollbackService` will **refuse** to switch metadata if the Supabase object is missing or has a checksum mismatch.

---

### Scenario D: Database Restoration Without Storage Desync
**Symptoms**: PostgreSQL point-in-time recovery (PITR) or backup restore required.

**Risk**: If a backup from $T_0$ is restored at $T_1$, newly uploaded audio objects between $T_0$ and $T_1$ will exist in R2 but will not have rows in `audio_files`.

**Procedure**:
1. Before restoring PostgreSQL, pause R2 uploads:
   ```bash
   npx supabase secrets set R2_UPLOADS_PAUSED=true --project-ref qqoybhevvnkycepujosm
   ```
2. Perform PostgreSQL restore via Supabase Dashboard.
3. Run integrity reconciliation to identify orphaned objects:
   ```bash
   node scripts/verify-storage-integrity.mjs
   ```
4. Any files present in R2 but missing from PostgreSQL will be listed in the reconciliation report. Use the report to re-link or archive the audio files.
5. Resume uploads:
   ```bash
   npx supabase secrets set R2_UPLOADS_PAUSED=false --project-ref qqoybhevvnkycepujosm
   ```

---

### Scenario E: Frontend Emergency Rollback
**Symptoms**: Critical UI bug discovered in production frontend.

**Procedure**:
1. Check current build commit:
   ```bash
   git log -1 --oneline
   ```
2. Roll back to the verified baseline commit `71ddb25`:
   ```bash
   git checkout 71ddb25
   npm ci
   npm run build
   ```
3. Redeploy the static build to Vercel / Netlify hosting.
4. **Compatibility Guarantee**: Commit `71ddb25` works with Supabase Storage natively. Because historical audio is untouched, 100% of historical broadcasts continue playing without interruption.

---

## 4. Operational Monitoring & Routine Audits

### 4.1 Daily / Weekly Storage Integrity Audit
Run the read-only integrity scanner:
```bash
node scripts/verify-storage-integrity.mjs
```
Expected output:
- `Historical Supabase Audio Files: 55 (PASS - 100% PRESERVED)`
- `Orphaned Objects in R2 Bucket: 0`
- `Total Anomalies: 0`

### 4.2 Monthly Cost Monitoring
Run the cost modeler:
```bash
node scripts/storage-cost-monitor.mjs
```
Verifies that monthly storage remains within the 10 GB free tier on R2 and tracks avoided egress charges from Supabase.

