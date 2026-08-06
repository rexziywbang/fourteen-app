"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

function hashPair(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function fitClass(left: string, right: string) {
  const longest = Math.max(left.length, right.length);
  if (longest > 16) return "is-very-long";
  if (longest > 10) return "is-long";
  return "";
}

export function RevealExperience({
  senderId,
  recipientId,
  senderName,
  recipientName,
  resolvedAt,
  isMutual,
}: {
  senderId: string;
  recipientId: string;
  senderName: string;
  recipientName: string;
  resolvedAt: string;
  isMutual: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backVisible, setBackVisible] = useState(true);
  const seed = useMemo(() => hashPair([senderId, recipientId].sort().join(":")), [senderId, recipientId]);
  const stars = useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: 34 }, (_, index) => ({
      id: index,
      x: 3 + random() * 94,
      y: 3 + random() * 94,
      radius: .35 + random() * 1.15,
      opacity: .12 + random() * .34,
    }));
  }, [seed]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBackVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(canvas.clientWidth * ratio);
      canvas.height = Math.floor(canvas.clientHeight * ratio);
    };
    resize();
    const random = seeded(seed ^ 0x9e3779b9);
    const particles = Array.from({ length: 60 }, () => ({
      angle: random() * Math.PI * 2,
      speed: 42 + random() * 120,
      size: 1 + random() * 2.6,
      color: ["#e3b34d", "#e75a80", "#f2eef7"][Math.floor(random() * 3)],
      drift: (random() - .5) * 34,
    }));
    const started = performance.now() + 720;
    let frame = 0;
    const draw = (time: number) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (time < started) { frame = requestAnimationFrame(draw); return; }
      const elapsed = Math.min((time - started) / 900, 1);
      const alpha = 1 - elapsed;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      for (const particle of particles) {
        const distance = particle.speed * elapsed * ratio;
        const x = centerX + Math.cos(particle.angle) * distance + particle.drift * elapsed * ratio;
        const y = centerY + Math.sin(particle.angle) * distance + 54 * elapsed * elapsed * ratio;
        context.globalAlpha = alpha;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(x, y, particle.size * ratio, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (elapsed < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [seed]);

  function revealBackLink() {
    setBackVisible(true);
    window.setTimeout(() => setBackVisible(false), 3000);
  }

  return (
    <main className="reveal-page" onPointerDown={revealBackLink}>
      <svg className="constellation" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {stars.map((star) => <circle key={star.id} cx={star.x} cy={star.y} r={star.radius} opacity={star.opacity} />)}
      </svg>
      <canvas className="reveal-burst" ref={canvasRef} aria-hidden="true" />
      <div className="reveal-wordmark">♥ fourteen</div>
      <section className="reveal-stage">
        <p className="eyebrow">{isMutual ? "It’s mutual" : "They said yes"}</p>
        <div className={`reveal-names ${fitClass(senderName, recipientName)}`}>
          <strong>{senderName}</strong>
          <span aria-label="and"><i>♥</i></span>
          <strong>{recipientName}</strong>
        </div>
        <p>{isMutual ? "You both chose each other. Same week, same feeling." : "The mystery ends here because they wanted it to."}</p>
        <time>{new Date(resolvedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</time>
      </section>
      <Link className={backVisible ? "is-visible" : ""} href="/home">Back to Fourteen →</Link>
    </main>
  );
}
