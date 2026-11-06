/**
 * Storage Observability & Telemetry Service
 *
 * Provides real-time metrics tracking, error classification, latency monitoring,
 * and automated alerting for the Supabase + Cloudflare R2 hybrid storage architecture.
 *
 * All operations are client-safe, read-only analytics or telemetry collection.
 * Maintains an in-memory & local ring buffer of recent operations without leaking secrets.
 */

export type StorageOperationType = 'UPLOAD' | 'PLAYBACK' | 'GATEWAY' | 'RECONCILIATION';
export type StorageOperationStatus = 'SUCCESS' | 'FAILURE';
export type StorageProviderType = 'supabase' | 'r2';

export interface StorageOperationEvent {
  id: string;
  type: StorageOperationType;
  status: StorageOperationStatus;
  provider: StorageProviderType;
  latencyMs: number;
  timestamp: string;
  details?: string;
  errorCode?: string;
}

export type StorageAlertRule =
  | 'CONSECUTIVE_UPLOAD_FAILURES'
  | 'GATEWAY_ERROR_BURST'
  | 'CHECKSUM_MISMATCH'
  | 'ORPHANED_OBJECTS'
  | 'GATEWAY_PAUSED'
  | 'STORAGE_INTEGRITY_DRIFT';

export interface StorageAlert {
  id: string;
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  createdAt: string;
  rule: StorageAlertRule;
}

export interface StorageObservabilityMetrics {
  totalUploads: number;
  successfulUploads: number;
  failedUploads: number;
  playbackSuccesses: number;
  playbackFailures: number;
  averageUploadLatencyMs: number;
  averagePlaybackLatencyMs: number;
  gatewayErrorRate: number;
  totalGatewayRequests: number;
  failedGatewayRequests: number;
  recentOperations: StorageOperationEvent[];
  alerts: StorageAlert[];
}

const STORAGE_KEY = 'vit_storage_observability_v1';
const MAX_RECENT_EVENTS = 50;

class StorageObservabilityService {
  private events: StorageOperationEvent[] = [];
  private consecutiveUploadFailures = 0;
  private uploadLatencies: number[] = [];
  private playbackLatencies: number[] = [];
  private totalGatewayRequests = 0;
  private failedGatewayRequests = 0;
  private alerts: StorageAlert[] = [];

  constructor() {
    this.loadPersistedState();
  }

  private loadPersistedState(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.events)) {
          this.events = parsed.events.slice(0, MAX_RECENT_EVENTS);
        }
        if (Array.isArray(parsed.alerts)) {
          this.alerts = parsed.alerts;
        }
        if (typeof parsed.consecutiveUploadFailures === 'number') {
          this.consecutiveUploadFailures = parsed.consecutiveUploadFailures;
        }
        if (Array.isArray(parsed.uploadLatencies)) {
          this.uploadLatencies = parsed.uploadLatencies.slice(-20);
        }
        if (Array.isArray(parsed.playbackLatencies)) {
          this.playbackLatencies = parsed.playbackLatencies.slice(-20);
        }
        if (typeof parsed.totalGatewayRequests === 'number') {
          this.totalGatewayRequests = parsed.totalGatewayRequests;
        }
        if (typeof parsed.failedGatewayRequests === 'number') {
          this.failedGatewayRequests = parsed.failedGatewayRequests;
        }
      }
    } catch {
      // Ignore parse errors on corrupted local cache
    }
  }

  private persistState(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          events: this.events.slice(0, MAX_RECENT_EVENTS),
          alerts: this.alerts,
          consecutiveUploadFailures: this.consecutiveUploadFailures,
          uploadLatencies: this.uploadLatencies.slice(-20),
          playbackLatencies: this.playbackLatencies.slice(-20),
          totalGatewayRequests: this.totalGatewayRequests,
          failedGatewayRequests: this.failedGatewayRequests,
        }),
      );
    } catch {
      // Ignore quota exceeded or private mode errors
    }
  }

  public recordUpload(params: {
    success: boolean;
    provider: StorageProviderType;
    latencyMs: number;
    details?: string;
    errorCode?: string;
  }): void {
    const event: StorageOperationEvent = {
      id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'UPLOAD',
      status: params.success ? 'SUCCESS' : 'FAILURE',
      provider: params.provider,
      latencyMs: Math.max(0, Math.round(params.latencyMs)),
      timestamp: new Date().toISOString(),
      details: params.details,
      errorCode: params.errorCode,
    };

    this.events.unshift(event);
    if (this.events.length > MAX_RECENT_EVENTS) this.events.pop();

    if (params.success) {
      this.consecutiveUploadFailures = 0;
      this.uploadLatencies.push(event.latencyMs);
      if (this.uploadLatencies.length > 30) this.uploadLatencies.shift();
      this.dismissAlert('CONSECUTIVE_UPLOAD_FAILURES');
    } else {
      this.consecutiveUploadFailures++;
      if (this.consecutiveUploadFailures >= 3) {
        this.raiseAlert({
          rule: 'CONSECUTIVE_UPLOAD_FAILURES',
          level: 'CRITICAL',
          title: 'Repeated Upload Failures Detected',
          message: `${this.consecutiveUploadFailures} consecutive audio upload operations have failed. Check R2 gateway health and user permissions.`,
        });
      }
    }

    this.persistState();
  }

  public recordPlayback(params: {
    success: boolean;
    provider: StorageProviderType;
    latencyMs: number;
    details?: string;
    errorCode?: string;
  }): void {
    const event: StorageOperationEvent = {
      id: `pb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'PLAYBACK',
      status: params.success ? 'SUCCESS' : 'FAILURE',
      provider: params.provider,
      latencyMs: Math.max(0, Math.round(params.latencyMs)),
      timestamp: new Date().toISOString(),
      details: params.details,
      errorCode: params.errorCode,
    };

    this.events.unshift(event);
    if (this.events.length > MAX_RECENT_EVENTS) this.events.pop();

    if (params.success) {
      this.playbackLatencies.push(event.latencyMs);
      if (this.playbackLatencies.length > 30) this.playbackLatencies.shift();
    }

    this.persistState();
  }

  public recordGatewayInvocation(params: {
    action: string;
    status: number;
    latencyMs: number;
    error?: string;
  }): void {
    this.totalGatewayRequests++;
    const isError = params.status >= 400;
    if (isError) {
      this.failedGatewayRequests++;
    }

    const event: StorageOperationEvent = {
      id: `gw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'GATEWAY',
      status: isError ? 'FAILURE' : 'SUCCESS',
      provider: 'r2',
      latencyMs: Math.max(0, Math.round(params.latencyMs)),
      timestamp: new Date().toISOString(),
      details: `Action: ${params.action} (${params.status}) ${params.error || ''}`.trim(),
      errorCode: isError ? `HTTP_${params.status}` : undefined,
    };

    this.events.unshift(event);
    if (this.events.length > MAX_RECENT_EVENTS) this.events.pop();

    if (params.status === 503) {
      this.raiseAlert({
        rule: 'GATEWAY_PAUSED',
        level: 'WARNING',
        title: 'R2 Gateway Uploads Paused',
        message: 'The operational killswitch (R2_UPLOADS_PAUSED=true) is currently active. New audio uploads are paused.',
      });
    }

    const errorRate = this.getGatewayErrorRate();
    if (this.totalGatewayRequests >= 5 && errorRate > 15) {
      this.raiseAlert({
        rule: 'GATEWAY_ERROR_BURST',
        level: 'WARNING',
        title: 'Elevated Gateway Error Rate',
        message: `R2 storage gateway error rate is currently ${errorRate.toFixed(1)}% across ${this.totalGatewayRequests} requests.`,
      });
    }

    this.persistState();
  }

  public recordChecksumMismatch(details: {
    path: string;
    expectedChecksum: string;
    actualChecksum: string;
  }): void {
    this.raiseAlert({
      rule: 'CHECKSUM_MISMATCH',
      level: 'CRITICAL',
      title: 'Storage Checksum Mismatch Detected',
      message: `File "${details.path}" failed SHA-256 integrity verification. Expected: ${details.expectedChecksum.slice(0, 8)}..., Actual: ${details.actualChecksum.slice(0, 8)}...`,
    });
    this.persistState();
  }

  public raiseAlert(alert: Omit<StorageAlert, 'id' | 'createdAt'>): void {
    // Avoid duplicate alerts for the same rule
    const existingIdx = this.alerts.findIndex((a) => a.rule === alert.rule);
    const item: StorageAlert = {
      ...alert,
      id: `alt_${alert.rule}_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      this.alerts[existingIdx] = item;
    } else {
      this.alerts.unshift(item);
    }
    this.persistState();
  }

  public dismissAlert(rule: StorageAlertRule): void {
    this.alerts = this.alerts.filter((a) => a.rule !== rule);
    this.persistState();
  }

  public clearAllAlerts(): void {
    this.alerts = [];
    this.persistState();
  }

  public getGatewayErrorRate(): number {
    if (this.totalGatewayRequests === 0) return 0;
    return Number(((this.failedGatewayRequests / this.totalGatewayRequests) * 100).toFixed(1));
  }

  public getObservabilitySnapshot(): StorageObservabilityMetrics {
    const uploadEvents = this.events.filter((e) => e.type === 'UPLOAD');
    const successfulUploads = uploadEvents.filter((e) => e.status === 'SUCCESS').length;
    const failedUploads = uploadEvents.filter((e) => e.status === 'FAILURE').length;

    const playbackEvents = this.events.filter((e) => e.type === 'PLAYBACK');
    const playbackSuccesses = playbackEvents.filter((e) => e.status === 'SUCCESS').length;
    const playbackFailures = playbackEvents.filter((e) => e.status === 'FAILURE').length;

    const avgUp =
      this.uploadLatencies.length > 0
        ? Math.round(this.uploadLatencies.reduce((a, b) => a + b, 0) / this.uploadLatencies.length)
        : 0;

    const avgPb =
      this.playbackLatencies.length > 0
        ? Math.round(this.playbackLatencies.reduce((a, b) => a + b, 0) / this.playbackLatencies.length)
        : 0;

    return {
      totalUploads: uploadEvents.length,
      successfulUploads,
      failedUploads,
      playbackSuccesses,
      playbackFailures,
      averageUploadLatencyMs: avgUp,
      averagePlaybackLatencyMs: avgPb,
      gatewayErrorRate: this.getGatewayErrorRate(),
      totalGatewayRequests: this.totalGatewayRequests,
      failedGatewayRequests: this.failedGatewayRequests,
      recentOperations: this.events.slice(0, 15),
      alerts: this.alerts,
    };
  }

  public resetMetrics(): void {
    this.events = [];
    this.alerts = [];
    this.consecutiveUploadFailures = 0;
    this.uploadLatencies = [];
    this.playbackLatencies = [];
    this.totalGatewayRequests = 0;
    this.failedGatewayRequests = 0;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export const storageObservabilityService = new StorageObservabilityService();
