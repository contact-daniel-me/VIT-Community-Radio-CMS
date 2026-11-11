import { useEffect, useRef } from 'react';
import {
  CONFETTI_PRESETS,
  isReducedMotionPreferred,
  type ConfettiBurstRequest,
} from '@/context/successFeedbackContext';

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  aspect: number;
  shape: 'ribbon' | 'square' | 'dot';
  color: string;
  rotation: number;
  vRot: number;
  tiltAngle: number;
  tiltSpeed: number;
  wobblePhase: number;
  wobbleSpeed: number;
  drag: number;
  gravity: number;
  bornAt: number;
  lifeMs: number;
}

const LIGHT_PALETTE = ['#d21e28', '#2e3192', '#17703a', '#d97706', '#2563eb', '#db2777'];
const DARK_PALETTE = ['#ef3b40', '#8b90ee', '#4ecb7b', '#facc15', '#60a5fa', '#f472b6'];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function activePalette(): string[] {
  if (typeof document !== 'undefined') {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') return DARK_PALETTE;
  }
  return LIGHT_PALETTE;
}

export function ConfettiCanvas({
  burst,
  onDone,
}: {
  burst: ConfettiBurstRequest | null;
  onDone: (id: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<ConfettiParticle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const lastBurstIdRef = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Immediately clear and disable animation if the user enables reduced motion mid-flight.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      if (mq.matches) {
        particlesRef.current = [];
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!burst) return;
    if (lastBurstIdRef.current === burst.id) return;
    lastBurstIdRef.current = burst.id;

    if (isReducedMotionPreferred()) {
      onDoneRef.current(burst.id);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') {
      onDoneRef.current(burst.id);
      return;
    }

    const cfg = CONFETTI_PRESETS[burst.preset];
    const palette = activePalette();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const now = performance.now();

    const origins = cfg.dualEmitter
      ? [
          { x: width * 0.41, y: height * 0.22, angleCenter: -Math.PI / 2 - 0.16 },
          { x: width * 0.5, y: height * 0.2, angleCenter: -Math.PI / 2 },
          { x: width * 0.59, y: height * 0.22, angleCenter: -Math.PI / 2 + 0.16 },
        ]
      : [{ x: width * 0.5, y: height * 0.25, angleCenter: -Math.PI / 2 }];

    const halfSpread = (cfg.spreadDeg * Math.PI) / 360;
    const shapes: ConfettiParticle['shape'][] = ['ribbon', 'square', 'ribbon', 'dot'];

    for (let i = 0; i < cfg.particleCount; i++) {
      const origin = origins[i % origins.length];
      const angle = origin.angleCenter + rand(-halfSpread, halfSpread);
      const speed = rand(cfg.minSpeed, cfg.maxSpeed);
      const shape = shapes[i % shapes.length];
      particlesRef.current.push({
        x: origin.x + rand(-18, 18),
        y: origin.y + rand(-8, 10),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(0.4, 1.4),
        size: rand(cfg.minSize, cfg.maxSize),
        aspect: shape === 'ribbon' ? rand(1.6, 2.3) : 1,
        shape,
        color: palette[i % palette.length],
        rotation: rand(0, Math.PI * 2),
        vRot: rand(-0.14, 0.14),
        tiltAngle: rand(0, Math.PI * 2),
        tiltSpeed: rand(0.08, 0.18),
        wobblePhase: rand(0, Math.PI * 2),
        wobbleSpeed: rand(0.05, 0.1),
        drag: 0.975,
        gravity: cfg.gravity + rand(-0.02, 0.02),
        bornAt: now,
        lifeMs: cfg.durationMs * rand(0.84, 1.0),
      });
    }

    const burstId = burst.id;

    const tick = (frameNow: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        particlesRef.current = [];
        rafRef.current = null;
        onDoneRef.current(burstId);
        return;
      }

      if (isReducedMotionPreferred()) {
        particlesRef.current = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        rafRef.current = null;
        onDoneRef.current(burstId);
        return;
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }

      const prevTime = lastFrameRef.current || frameNow;
      lastFrameRef.current = frameNow;
      const dtFactor = Math.min(Math.max((frameNow - prevTime) / 16.667, 0.4), 2.2);

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);

      const remaining: ConfettiParticle[] = [];
      for (const p of particlesRef.current) {
        const age = frameNow - p.bornAt;
        if (age >= p.lifeMs) continue;

        const progress = age / p.lifeMs;
        const alpha = progress < 0.65 ? 1 : Math.max(0, 1 - (progress - 0.65) / 0.35);

        p.vx *= Math.pow(p.drag, dtFactor);
        p.vy = p.vy * Math.pow(p.drag, dtFactor) + p.gravity * dtFactor;
        p.x += (p.vx + Math.sin(p.wobblePhase) * 0.45) * dtFactor;
        p.y += p.vy * dtFactor;
        p.rotation += p.vRot * dtFactor;
        p.tiltAngle += p.tiltSpeed * dtFactor;
        p.wobblePhase += p.wobbleSpeed * dtFactor;

        if (p.y > vh + 24) continue;
        remaining.push(p);

        ctx.save();
        ctx.globalAlpha = alpha * 0.92;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const flutter = Math.max(0.25, Math.abs(Math.cos(p.tiltAngle)));
          const w = p.size;
          const h = p.size * p.aspect * flutter;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(-w / 2, -h / 2, w, h, 1.5);
          } else {
            ctx.rect(-w / 2, -h / 2, w, h);
          }
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore();
      particlesRef.current = remaining;

      if (remaining.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        lastFrameRef.current = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onDoneRef.current(burstId);
      }
    };

    if (rafRef.current === null) {
      lastFrameRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [burst]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      particlesRef.current = [];
      const ctx = canvasEl?.getContext('2d');
      if (canvasEl && ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    };
  }, []);

  if (!burst) return null;

  return <canvas ref={canvasRef} className="sf-confetti-canvas" aria-hidden="true" />;
}

