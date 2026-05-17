"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePageBundle } from "@/lib/client/page-api";

type PeerNode = {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
};

type CameraState = {
  yaw: number;
  pitch: number;
  zoom: number;
};

const COLORS = ["#3b8cf5", "#44b834", "#ff8c28", "#7a5cff", "#e95f9f", "#14a3a0"];

export function PeerNetworkPage() {
  const { bundle, usersById, buildScopedHref } = usePageBundle();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<CameraState>({ yaw: 0.55, pitch: 0.32, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [camera, setCamera] = useState(cameraRef.current);

  const peers = useMemo<PeerNode[]>(() => {
    const seen = new Map<string, string>();
    for (const post of bundle?.posts ?? []) {
      if (post.user_id) {
        const profile = usersById[post.user_id];
        seen.set(
          post.user_id,
          profile?.display_name?.trim() || profile?.username?.trim() || `user_${post.user_id.slice(0, 8)}`,
        );
      }
    }

    const names = [...seen.entries()].slice(0, 10);
    const fallback = names.length > 0 ? names : [["global", "Global"], ["domain", "Domain"], ["you", "You"]];
    return fallback.map(([id, label], index) => {
      const angle = (Math.PI * 2 * index) / fallback.length;
      const radius = index === 0 ? 0 : 1.8 + (index % 3) * 0.22;
      return {
        id,
        label,
        color: COLORS[index % COLORS.length],
        x: Math.cos(angle) * radius,
        y: Math.sin(index * 1.7) * 0.9,
        z: Math.sin(angle) * radius,
      };
    });
  }, [bundle?.posts, usersById]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let frame = 0;
    let animation = 0;
    const render = () => {
      frame += 0.012;
      drawPeerNetwork(canvas, context, peers, cameraRef.current, frame);
      animation = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(animation);
  }, [peers]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(event.key)) {
        return;
      }

      event.preventDefault();
      setCamera((current) => {
        if (event.key === "ArrowLeft") return { ...current, yaw: current.yaw - 0.08 };
        if (event.key === "ArrowRight") return { ...current, yaw: current.yaw + 0.08 };
        if (event.key === "ArrowUp") return { ...current, pitch: clamp(current.pitch + 0.06, -1, 1) };
        if (event.key === "ArrowDown") return { ...current, pitch: clamp(current.pitch - 0.06, -1, 1) };
        if (event.key === "+" || event.key === "=") return { ...current, zoom: clamp(current.zoom + 0.08, 0.6, 1.8) };
        return { ...current, zoom: clamp(current.zoom - 0.08, 0.6, 1.8) };
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const beginDrag = (x: number, y: number) => {
    dragRef.current = { x, y };
  };
  const moveDrag = (x: number, y: number) => {
    const last = dragRef.current;
    if (!last) {
      return;
    }

    const dx = x - last.x;
    const dy = y - last.y;
    dragRef.current = { x, y };
    setCamera((current) => ({
      ...current,
      yaw: current.yaw + dx * 0.008,
      pitch: clamp(current.pitch + dy * 0.006, -1, 1),
    }));
  };

  return (
    <main className="peer-map-shell">
      <div className="app-background" aria-hidden="true">
        <div className="sky" />
        <div className="clouds">
          <div className="cloud cloud-1" />
          <div className="cloud cloud-3" />
        </div>
        <div className="ground" />
      </div>
      <section className="peer-map-window xp-window" aria-labelledby="peer-map-title">
        <div className="xp-title-bar chat-titlebar">
          <span className="xp-title-icon" aria-hidden="true">●</span>
          <span className="xp-title-text" id="peer-map-title">PairPod - 3D Peer Map</span>
          <div className="xp-title-controls" aria-hidden="true">
            <span className="xp-title-btn xp-title-btn--min">_</span>
            <span className="xp-title-btn xp-title-btn--max">[]</span>
            <span className="xp-title-btn xp-title-btn--close">x</span>
          </div>
        </div>
        <nav className="chat-menu chat-nav" aria-label="Peer map menu">
          <a href={buildScopedHref("/")}>Room</a>
          <a href={buildScopedHref("/chat")}>Chat</a>
          <a href={buildScopedHref("/posts")}>Posts</a>
          <a className="chat-nav__active" href={buildScopedHref("/peers")}>3D Peers</a>
        </nav>
        <div className="peer-map-body">
          <canvas
            ref={canvasRef}
            className="peer-map-canvas"
            width={960}
            height={620}
            onMouseDown={(event) => beginDrag(event.clientX, event.clientY)}
            onMouseMove={(event) => moveDrag(event.clientX, event.clientY)}
            onMouseUp={() => {
              dragRef.current = null;
            }}
            onMouseLeave={() => {
              dragRef.current = null;
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (touch) beginDrag(touch.clientX, touch.clientY);
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (touch) moveDrag(touch.clientX, touch.clientY);
            }}
            onTouchEnd={() => {
              dragRef.current = null;
            }}
          />
          <div className="peer-map-controls">
            <button type="button" onClick={() => setCamera((c) => ({ ...c, yaw: c.yaw - 0.3 }))}>Left</button>
            <button type="button" onClick={() => setCamera((c) => ({ ...c, yaw: c.yaw + 0.3 }))}>Right</button>
            <button type="button" onClick={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom + 0.15, 0.6, 1.8) }))}>Zoom +</button>
            <button type="button" onClick={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom - 0.15, 0.6, 1.8) }))}>Zoom -</button>
          </div>
        </div>
      </section>
    </main>
  );
}

function drawPeerNetwork(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  peers: PeerNode[],
  camera: CameraState,
  frame: number,
) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#071b46");
  gradient.addColorStop(0.55, "#0d5cc0");
  gradient.addColorStop(1, "#5cb838");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const projected = peers.map((peer, index) =>
    projectPeer(
      { ...peer, y: peer.y + Math.sin(frame * 2 + index) * 0.08 },
      camera,
      width,
      height,
    ),
  );

  context.lineWidth = 2 * scale;
  for (let i = 0; i < projected.length; i += 1) {
    for (let j = i + 1; j < projected.length; j += 1) {
      const a = projected[i];
      const b = projected[j];
      context.strokeStyle = `rgba(255,255,255,${0.12 + Math.max(0, 1 - Math.abs(a.depth - b.depth)) * 0.16})`;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  projected
    .sort((a, b) => b.depth - a.depth)
    .forEach((point) => {
      context.beginPath();
      context.fillStyle = point.color;
      context.shadowColor = point.color;
      context.shadowBlur = 18 * scale;
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = "#fff";
      context.font = `${Math.max(11, 13 * scale)}px Nunito, sans-serif`;
      context.textAlign = "center";
      context.fillText(point.label, point.x, point.y + point.radius + 18 * scale);
    });
}

function projectPeer(peer: PeerNode, camera: CameraState, width: number, height: number) {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const x1 = peer.x * cy - peer.z * sy;
  const z1 = peer.x * sy + peer.z * cy;
  const y1 = peer.y * cp - z1 * sp;
  const z2 = peer.y * sp + z1 * cp + 5;
  const perspective = (170 * camera.zoom) / z2;

  return {
    ...peer,
    x: width / 2 + x1 * perspective,
    y: height / 2 + y1 * perspective,
    depth: z2,
    radius: Math.max(10, 22 * camera.zoom * (1 / z2 + 0.18)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
