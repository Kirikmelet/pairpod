"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { usePageBundle } from "@/lib/client/page-api";

type PeerNode = {
  id: string;
  label: string;
  message: string;
  color: string;
  x: number;
  z: number;
};

type DoorNode = {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  color: string;
  x: number;
  z: number;
  rotation: number;
};

type PlayerState = {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  mode: "third" | "first";
};

const COLORS = [0x3b8cf5, 0x44b834, 0xff8c28, 0x7a5cff, 0xe95f9f, 0x14a3a0];
const FALLBACK_PEERS: Array<[string, string, string]> = [
  ["you", "You", "scouting the map"],
  ["global", "Global", "global chat is open"],
  ["domain", "Domain", "domain pod loaded"],
  ["ai", "AI Peer", "thinking up a thread"],
];
const PLAYER_START: PlayerState = {
  x: 0,
  z: 8,
  yaw: Math.PI,
  pitch: 0,
  mode: "third",
};

export function PeerNetworkPage() {
  const { bundle, usersById, buildScopedHref } = usePageBundle();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<PlayerState>({ ...PLAYER_START });
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const peersRef = useRef<PeerNode[]>([]);
  const doorsRef = useRef<DoorNode[]>([]);
  const activeDoorIdRef = useRef<string | null>(null);
  const [player, setPlayer] = useState<PlayerState>({ ...PLAYER_START });
  const [activeDoor, setActiveDoor] = useState<DoorNode | null>(null);

  const peers = useMemo<PeerNode[]>(() => {
    const seen = new Map<string, string>();
    const messages = new Map<string, string>();
    for (const post of bundle?.posts ?? []) {
      if (!post.user_id) continue;
      const profile = usersById[post.user_id];
      seen.set(
        post.user_id,
        profile?.display_name?.trim() ||
          profile?.username?.trim() ||
          `user_${post.user_id.slice(0, 8)}`,
      );
      messages.set(post.user_id, post.header?.trim() || post.content.trim());
    }

    for (const comment of bundle?.comments ?? []) {
      if (!comment.user_id) continue;
      messages.set(comment.user_id, comment.content.trim());
    }

    const names = [...seen.entries()].slice(0, 14);
    const fallback = names.length > 0
      ? names
      : FALLBACK_PEERS.map(([id, label]) => [id, label]);

    return fallback.map(([id, label], index) => {
      const angle = (Math.PI * 2 * index) / fallback.length;
      const radius = index === 0 ? 0 : 5.5 + (index % 3) * 1.4;
      const fallbackMessage = FALLBACK_PEERS[index % FALLBACK_PEERS.length]?.[2] ?? "hello from the pod";
      return {
        id,
        label,
        message: messages.get(id)?.slice(0, 72) || fallbackMessage,
        color: `#${COLORS[index % COLORS.length].toString(16).padStart(6, "0")}`,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };
    });
  }, [bundle?.comments, bundle?.posts, usersById]);

  const doors = useMemo<DoorNode[]>(
    () => [
      {
        id: "room",
        label: "Room",
        subtitle: "pod lobby",
        href: buildScopedHref("/"),
        color: "#44b834",
        x: -8.8,
        z: -8.8,
        rotation: Math.PI * 0.25,
      },
      {
        id: "chat",
        label: "Chat",
        subtitle: "live room",
        href: buildScopedHref("/chat"),
        color: "#3b8cf5",
        x: 0,
        z: -11.2,
        rotation: 0,
      },
      {
        id: "posts",
        label: "Posts",
        subtitle: "threads",
        href: buildScopedHref("/posts"),
        color: "#ff8c28",
        x: 8.8,
        z: -8.8,
        rotation: -Math.PI * 0.25,
      },
      {
        id: "dms",
        label: "DMs",
        subtitle: "private",
        href: buildScopedHref("/dms"),
        color: "#7a5cff",
        x: 10.8,
        z: 2.8,
        rotation: -Math.PI * 0.52,
      },
      {
        id: "profile",
        label: "Profile",
        subtitle: "avatar",
        href: buildScopedHref("/profile"),
        color: "#e95f9f",
        x: -10.8,
        z: 2.8,
        rotation: Math.PI * 0.52,
      },
    ],
    [buildScopedHref],
  );

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    doorsRef.current = doors;
  }, [doors]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!isMovementKey(event.key)) return;
      event.preventDefault();
      keysRef.current.add(event.key.toLowerCase());
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88d5ff);
    scene.fog = new THREE.Fog(0x88d5ff, 18, 46);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffffff, 0x2c6b1d, 2.3);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(8, 14, 5);
    sun.castShadow = true;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({ color: 0x43a827, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(70, 35, 0xffffff, 0xcaf6d2);
    grid.position.y = 0.015;
    scene.add(grid);

    const peerRoot = new THREE.Group();
    scene.add(peerRoot);
    const connectionRoot = new THREE.Group();
    scene.add(connectionRoot);
    const doorRoot = new THREE.Group();
    scene.add(doorRoot);

    const playerMarker = createPlayerMarker();
    scene.add(playerMarker);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();
    let animation = 0;
    let currentPeerKey = "";
    let currentDoorKey = "";
    let pointerStart: { x: number; y: number } | null = null;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const refreshPeers = () => {
      const key = peersRef.current.map((peer) => `${peer.id}:${peer.label}:${peer.message}`).join("|");
      if (key === currentPeerKey) return;
      currentPeerKey = key;
      peerRoot.clear();
      connectionRoot.clear();

      for (let index = 0; index < peersRef.current.length; index += 1) {
        peerRoot.add(createPeerAvatar(peersRef.current[index], index));
      }

      const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
      for (let i = 0; i < peersRef.current.length; i += 1) {
        for (let j = i + 1; j < peersRef.current.length; j += 1) {
          if (Math.abs(i - j) > 3 && !(i === 0 || j === 0)) continue;
          const a = peersRef.current[i];
          const b = peersRef.current[j];
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(a.x, 1.4, a.z),
            new THREE.Vector3(b.x, 1.4, b.z),
          ]);
          const line = new THREE.Line(geometry, material);
          line.userData.peerIndexes = [i, j];
          connectionRoot.add(line);
        }
      }
    };

    const refreshDoors = () => {
      const key = doorsRef.current.map((door) => `${door.id}:${door.href}`).join("|");
      if (key === currentDoorKey) return;
      currentDoorKey = key;
      doorRoot.clear();

      for (const door of doorsRef.current) {
        doorRoot.add(createDoorPortal(door));
      }
    };

    const pickDoor = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(doorRoot.children, true);
      const target = hits
        .map((hit: any) => findDoorTarget(hit.object))
        .find(Boolean);
      if (target?.userData?.href) {
        window.location.href = target.userData.href;
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerStart) return;
      const didDrag = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6;
      pointerStart = null;
      if (!didDrag) {
        pickDoor(event);
      }
    };

    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      updatePlayerFromKeys(delta);
      refreshPeers();
      refreshDoors();
      positionCamera(camera, playerRef.current);
      playerMarker.position.set(playerRef.current.x, 0.02, playerRef.current.z);
      playerMarker.rotation.y = playerRef.current.yaw;
      peerRoot.children.forEach((child: any, index: number) => {
        animatePeer(child, index, performance.now() * 0.001);
      });
      updateConnectionLines(connectionRoot, peerRoot);
      updateActiveDoor(playerRef.current, doorsRef.current, activeDoorIdRef, setActiveDoor);
      renderer.render(scene, camera);
      animation = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    animation = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animation);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.dispose();
      renderer.domElement.remove();
      disposeObject(scene);
    };
  }, []);

  const startDrag = (x: number, y: number) => {
    dragRef.current = { x, y };
  };
  const moveDrag = (x: number, y: number) => {
    const last = dragRef.current;
    if (!last) return;
    const dx = x - last.x;
    const dy = y - last.y;
    dragRef.current = { x, y };
    setPlayer((current) => ({
      ...current,
      yaw: current.yaw - dx * 0.006,
      pitch: clamp(current.pitch - dy * 0.004, -0.55, 0.55),
    }));
  };
  const nudge = (forward: number, strafe = 0) => {
    setPlayer((current) => movePlayer(current, forward, strafe, 0.85));
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
          <span className="xp-title-text" id="peer-map-title">PairPod - PeerScape</span>
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
          <div
            ref={mountRef}
            className="peer-map-stage"
            role="img"
            aria-label="Controllable 3D peer map"
            onMouseDown={(event) => startDrag(event.clientX, event.clientY)}
            onMouseMove={(event) => moveDrag(event.clientX, event.clientY)}
            onMouseUp={() => {
              dragRef.current = null;
            }}
            onMouseLeave={() => {
              dragRef.current = null;
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (touch) startDrag(touch.clientX, touch.clientY);
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (touch) moveDrag(touch.clientX, touch.clientY);
            }}
            onTouchEnd={() => {
              dragRef.current = null;
            }}
          />
          <div className="peer-map-hud">
            <strong>WASD / arrows to walk</strong>
            <span>Click a glowing door, or walk up to one and enter from here.</span>
            {activeDoor ? (
              <a className="peer-map-door-link" href={activeDoor.href}>
                Enter {activeDoor.label}
              </a>
            ) : null}
          </div>
          <div className="peer-map-controls">
            <button type="button" onClick={() => nudge(1)}>Forward</button>
            <button type="button" onClick={() => nudge(-1)}>Back</button>
            <button type="button" onClick={() => nudge(0, -1)}>Left</button>
            <button type="button" onClick={() => nudge(0, 1)}>Right</button>
            <button
              type="button"
              onClick={() => setPlayer((current) => ({ ...current, mode: current.mode === "third" ? "first" : "third" }))}
            >
              {player.mode === "third" ? "First person" : "Third person"}
            </button>
            <button type="button" onClick={() => setPlayer({ ...PLAYER_START })}>Reset</button>
          </div>
        </div>
      </section>
    </main>
  );

  function updatePlayerFromKeys(delta: number) {
    const keys = keysRef.current;
    const forward = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const strafe = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    const turn = (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0);
    if (turn) {
      setPlayer((current) => ({
        ...current,
        yaw: current.yaw - turn * delta * 2.4,
      }));
    }
    if (!forward && !strafe) return;
    setPlayer((current) => movePlayer(current, forward, strafe, delta * 4.8));
  }
}

function createPeerAvatar(peer: PeerNode, index: number) {
  const group = new THREE.Group();
  group.position.set(peer.x, 0, peer.z);
  group.userData.homeX = peer.x;
  group.userData.homeZ = peer.z;
  group.userData.wanderSeed = index * 1.73 + peer.id.length * 0.37;

  const color = new THREE.Color(peer.color);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.72, 6, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
  );
  body.position.y = 0.78;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf7ffe8, roughness: 0.7 }),
  );
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);

  const beacon = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.035, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
  );
  beacon.position.y = 0.04;
  beacon.rotation.x = Math.PI / 2;
  group.add(beacon);

  const label = createLabelSprite(peer.label);
  label.position.y = 2.25;
  group.add(label);

  const speech = createSpeechSprite(peer.message);
  speech.position.y = 3.05;
  group.add(speech);
  return group;
}

function createPlayerMarker() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 0.9, 4),
    new THREE.MeshStandardMaterial({ color: 0xff8c28, roughness: 0.55 }),
  );
  body.position.y = 0.45;
  body.rotation.y = Math.PI / 4;
  body.castShadow = true;
  group.add(body);
  return group;
}

function createDoorPortal(door: DoorNode) {
  const group = new THREE.Group();
  group.position.set(door.x, 0, door.z);
  group.rotation.y = door.rotation;
  group.userData.href = door.href;
  group.userData.label = door.label;

  const color = new THREE.Color(door.color);
  const frameMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: 0.12,
  });
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0xeef6ff,
    roughness: 0.55,
    transparent: true,
    opacity: 0.88,
    emissive: color,
    emissiveIntensity: 0.18,
  });

  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.7, 0.24), frameMaterial);
  leftPost.position.set(-0.88, 1.35, 0);
  const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.7, 0.24), frameMaterial);
  rightPost.position.set(0.88, 1.35, 0);
  const topPost = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 0.24), frameMaterial);
  topPost.position.set(0, 2.62, 0);
  const portal = new THREE.Mesh(new THREE.BoxGeometry(1.48, 2.18, 0.08), panelMaterial);
  portal.position.set(0, 1.28, -0.03);

  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(1.03, 0.035, 10, 60),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 }),
  );
  glow.position.set(0, 1.34, -0.08);
  glow.scale.y = 1.42;

  for (const mesh of [leftPost, rightPost, topPost, portal, glow]) {
    mesh.castShadow = true;
    mesh.userData.href = door.href;
    mesh.userData.label = door.label;
    group.add(mesh);
  }

  const label = createDoorLabelSprite(door.label, door.subtitle, door.color);
  label.position.set(0, 3.12, -0.04);
  label.userData.href = door.href;
  label.userData.label = door.label;
  group.add(label);

  return group;
}

function createLabelSprite(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(0, 22, 68, 0.86)";
    roundRect(context, 8, 18, 496, 84, 22);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = "700 42px Nunito, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label.slice(0, 20), 256, 60);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(2.8, 0.7, 1);
  return sprite;
}

function createDoorLabelSprite(label: string, subtitle: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 168;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(0, 20, 68, 0.88)";
    roundRect(context, 16, 18, 480, 116, 24);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 5;
    roundRect(context, 16, 18, 480, 116, 24);
    context.stroke();
    context.fillStyle = "#ffffff";
    context.font = "800 44px Nunito, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 256, 62);
    context.fillStyle = "rgba(225,239,255,0.92)";
    context.font = "700 26px Nunito, Arial, sans-serif";
    context.fillText(subtitle, 256, 104);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(2.85, 0.94, 1);
  return sprite;
}

function createSpeechSprite(message: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(context, 18, 18, 604, 112, 28);
    context.fill();
    context.fillStyle = "rgba(255,255,255,0.94)";
    context.beginPath();
    context.moveTo(286, 126);
    context.lineTo(320, 160);
    context.lineTo(354, 126);
    context.closePath();
    context.fill();
    context.strokeStyle = "rgba(37,96,190,0.32)";
    context.lineWidth = 4;
    roundRect(context, 18, 18, 604, 112, 28);
    context.stroke();
    context.fillStyle = "#10245c";
    context.font = "700 32px Nunito, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(truncateCanvasText(message || "...", 32), 320, 74);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(3.6, 1.02, 1);
  return sprite;
}

function animatePeer(peer: any, index: number, time: number) {
  const seed = Number(peer.userData.wanderSeed ?? index);
  const homeX = Number(peer.userData.homeX ?? peer.position.x);
  const homeZ = Number(peer.userData.homeZ ?? peer.position.z);
  const wanderRadius = index === 0 ? 1.2 : 1.9;
  const targetX = homeX + Math.sin(time * 0.34 + seed) * wanderRadius;
  const targetZ = homeZ + Math.cos(time * 0.27 + seed * 1.4) * wanderRadius;
  peer.position.x += (targetX - peer.position.x) * 0.018;
  peer.position.z += (targetZ - peer.position.z) * 0.018;
  peer.position.x = clamp(peer.position.x, -27, 27);
  peer.position.z = clamp(peer.position.z, -27, 27);
  peer.rotation.y = Math.atan2(targetX - peer.position.x, targetZ - peer.position.z);
  peer.position.y = Math.sin(time * 1.8 + seed) * 0.05;
}

function updateConnectionLines(connectionRoot: any, peerRoot: any) {
  connectionRoot.children.forEach((line: any) => {
    const [aIndex, bIndex] = line.userData.peerIndexes ?? [];
    const a = peerRoot.children[aIndex];
    const b = peerRoot.children[bIndex];
    if (!a || !b || !line.geometry?.attributes?.position) {
      return;
    }

    const positions = line.geometry.attributes.position;
    positions.setXYZ(0, a.position.x, 1.4, a.position.z);
    positions.setXYZ(1, b.position.x, 1.4, b.position.z);
    positions.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  });
}

function updateActiveDoor(
  player: PlayerState,
  doors: DoorNode[],
  activeDoorIdRef: { current: string | null },
  setActiveDoor: (door: DoorNode | null) => void,
) {
  const nearestDoor = doors
    .map((door) => ({
      door,
      distance: Math.hypot(door.x - player.x, door.z - player.z),
    }))
    .filter(({ distance }) => distance < 2.65)
    .sort((a, b) => a.distance - b.distance)[0]?.door ?? null;

  if ((nearestDoor?.id ?? null) === activeDoorIdRef.current) {
    return;
  }

  activeDoorIdRef.current = nearestDoor?.id ?? null;
  setActiveDoor(nearestDoor);
}

function findDoorTarget(object: any): any | null {
  let current = object;
  while (current) {
    if (current.userData?.href) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

function positionCamera(camera: any, player: PlayerState) {
  const direction = new THREE.Vector3(Math.sin(player.yaw), player.pitch, Math.cos(player.yaw)).normalize();
  const position = new THREE.Vector3(player.x, 1.55, player.z);
  if (player.mode === "first") {
    camera.position.copy(position);
    camera.lookAt(position.clone().add(direction.multiplyScalar(8)));
    return;
  }

  const behind = new THREE.Vector3(-Math.sin(player.yaw) * 6, 4.2, -Math.cos(player.yaw) * 6);
  camera.position.copy(position.clone().add(behind));
  camera.lookAt(position.x, 1.05, position.z);
}

function movePlayer(current: PlayerState, forward: number, strafe: number, distance: number): PlayerState {
  const sin = Math.sin(current.yaw);
  const cos = Math.cos(current.yaw);
  const magnitude = Math.max(1, Math.hypot(forward, strafe));
  const normalizedForward = forward / magnitude;
  const normalizedStrafe = strafe / magnitude;
  return {
    ...current,
    x: clamp(current.x + (sin * normalizedForward + cos * normalizedStrafe) * distance, -28, 28),
    z: clamp(current.z + (cos * normalizedForward - sin * normalizedStrafe) * distance, -28, 28),
  };
}

function isMovementKey(key: string) {
  return ["w", "a", "s", "d", "q", "e", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key.toLowerCase());
}

function truncateCanvasText(value: string, maxLength: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}

function disposeObject(object: any) {
  object.traverse((child: any) => {
    const mesh = child;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
