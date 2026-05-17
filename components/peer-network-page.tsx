"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as THREE from "three";
import {
  type PageRouteRecord,
  type PostRecord,
  type UserProfileRecord,
  useCurrentUserProfile,
  usePageBundle,
} from "@/lib/client/page-api";
import type { Json } from "@/utils/database.types";
import { createClient } from "@/utils/supabase/client";

type PeerNode = {
  id: string;
  label: string;
  message: string;
  chatBubble: ChatBubble | null;
  character: Character3dConfig;
  avatarUrl: string | null;
  clothingUrl: string | null;
  color: string;
  x: number;
  z: number;
};

type Character3dConfig = {
  body: string;
  accent: string;
  head: string;
  style: "pod" | "runner" | "bot";
  clothingImageUrl?: string | null;
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
  mode: "iso" | "third" | "first";
};

type ChatBubble = {
  body: string;
  createdAt: string;
};

type PlayerAvatar = {
  character: Character3dConfig;
  avatarUrl: string | null;
  clothingUrl: string | null;
};

type OnlinePeerProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  configurations: Json;
  avatar_url: string | null;
  clothing_url?: string | null;
};

const COLORS = [0x3b8cf5, 0x44b834, 0xff8c28, 0x7a5cff, 0xe95f9f, 0x14a3a0];
const DEFAULT_CHARACTER_3D: Character3dConfig = {
  body: "#6ebe44",
  accent: "#2d90ff",
  head: "#f7ffe8",
  style: "pod",
};
const PLAYER_START: PlayerState = {
  x: 0,
  z: 8,
  yaw: Math.PI * 0.75,
  pitch: 0.12,
  mode: "iso",
};
const ONLINE_PEER_WINDOW_MS = 45_000;
const ONLINE_PEER_HEARTBEAT_MS = 10_000;

export function PeerNetworkPage() {
  const searchParams = useSearchParams();
  const rawWebsiteUrl = searchParams.get("url");
  const { bundle, buildScopedHref, currentUrl, domainUrl } = usePageBundle();
  const { profile } = useCurrentUserProfile();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<PlayerState>({ ...PLAYER_START });
  const playerAvatarRef = useRef<PlayerAvatar>({
    character: DEFAULT_CHARACTER_3D,
    avatarUrl: null,
    clothingUrl: null,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const peersRef = useRef<PeerNode[]>([]);
  const doorsRef = useRef<DoorNode[]>([]);
  const activeDoorIdRef = useRef<string | null>(null);
  const [player, setPlayer] = useState<PlayerState>({ ...PLAYER_START });
  const [activeDoor, setActiveDoor] = useState<DoorNode | null>(null);
  const [onlineProfiles, setOnlineProfiles] = useState<OnlinePeerProfile[]>([]);

  const playerAvatar = useMemo<PlayerAvatar>(() => {
    const character = readCharacter3d(profile?.configurations);
    return {
      character,
      avatarUrl: profile?.avatar_url ?? null,
      clothingUrl: profile?.clothing_url ?? character.clothingImageUrl ?? null,
    };
  }, [profile]);

  const peers = useMemo<PeerNode[]>(() => {
    const messages = new Map<string, string>();
    const chatBubbles = new Map<string, ChatBubble>();
    const currentUserId = profile?.id ?? null;

    for (const chat of bundle?.chats ?? []) {
      if (!chat.user_id || chat.user_id === currentUserId) continue;
      messages.set(chat.user_id, chat.body?.trim() || "chatting in the room");
      if (chat.body?.trim()) {
        chatBubbles.set(chat.user_id, {
          body: chat.body.trim(),
          createdAt: chat.created_at,
        });
      }
    }

    for (const post of bundle?.posts ?? []) {
      if (!post.user_id || post.user_id === currentUserId) continue;
      messages.set(post.user_id, post.header?.trim() || post.content.trim());
    }

    for (const comment of bundle?.comments ?? []) {
      if (!comment.user_id || comment.user_id === currentUserId) continue;
      messages.set(comment.user_id, comment.content.trim());
    }

    const aiProfiles = (bundle?.users ?? [])
      .filter((user) => user.id !== currentUserId && isAiFakeUser(user))
      .map((user) => ({
        id: user.id,
        username: user.username,
        display_name: user.display_name ?? null,
        configurations: user.configurations,
        avatar_url: user.avatar_url,
        clothing_url: user.clothing_url,
      }));
    const mergedProfiles = new Map<string, OnlinePeerProfile>();
    for (const onlineProfile of onlineProfiles) {
      mergedProfiles.set(onlineProfile.id, onlineProfile);
    }
    for (const aiProfile of aiProfiles) {
      mergedProfiles.set(aiProfile.id, aiProfile);
    }
    const online = [...mergedProfiles.values()].slice(0, 14);

    return online.map((profileForPeer, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, online.length);
      const radius = 5.5 + (index % 3) * 1.4;
      const character = readCharacter3d(profileForPeer?.configurations);
      const id = profileForPeer.id;
      return {
        id,
        label:
          profileForPeer.display_name?.trim() ||
          profileForPeer.username?.trim() ||
          `user_${id.slice(0, 8)}`,
        message: messages.get(id)?.slice(0, 72) || "online now",
        chatBubble: chatBubbles.get(id) ?? null,
        character,
        avatarUrl: profileForPeer?.avatar_url ?? null,
        clothingUrl: profileForPeer?.clothing_url ?? character.clothingImageUrl ?? null,
        color: `#${COLORS[index % COLORS.length].toString(16).padStart(6, "0")}`,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };
    });
  }, [bundle?.chats, bundle?.comments, bundle?.posts, bundle?.users, onlineProfiles, profile?.id]);

  const doors = useMemo<DoorNode[]>(() => {
    const appDoors: DoorNode[] = [
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
    ];

    return [
      ...appDoors,
      ...buildWebsiteRouteDoors({
        rawUrl: rawWebsiteUrl,
        currentUrl,
        domainUrl,
        routes: bundle?.routes ?? [],
        posts: bundle?.posts ?? [],
      }),
    ];
  }, [buildScopedHref, bundle?.posts, bundle?.routes, currentUrl, domainUrl, rawWebsiteUrl]);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    playerAvatarRef.current = playerAvatar;
  }, [playerAvatar]);

  useEffect(() => {
    const pageId = bundle?.page.id;
    const userId = profile?.id;
    if (!pageId || !userId) {
      setOnlineProfiles([]);
      return;
    }

    let cancelled = false;
    const supabase = createClient() as any;

    const refreshPresence = async () => {
      try {
        await supabase
          .from("page_presence")
          .upsert(
            {
              page_id: pageId,
              user_id: userId,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "page_id,user_id" },
          );

        const since = new Date(Date.now() - ONLINE_PEER_WINDOW_MS).toISOString();
        const { data: presenceRows, error: presenceError } = await supabase
          .from("page_presence")
          .select("user_id,last_seen_at")
          .eq("page_id", pageId)
          .gte("last_seen_at", since)
          .neq("user_id", userId)
          .order("last_seen_at", { ascending: false });

        if (presenceError) {
          if (!isMissingOptionalPresenceTable(presenceError) && !cancelled) {
            console.warn("Could not load online peers.", presenceError);
          }
          if (!cancelled) setOnlineProfiles([]);
          return;
        }

        const userIds = [...new Set((presenceRows ?? []).map((row: any) => row.user_id).filter(Boolean))];
        if (userIds.length === 0) {
          if (!cancelled) setOnlineProfiles([]);
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from("users")
          .select("id,username,display_name,configurations,avatar_url,clothing_url")
          .in("id", userIds);

        if (profilesError) {
          throw profilesError;
        }

        if (!cancelled) {
          const profileById = new Map((profiles ?? []).map((entry: OnlinePeerProfile) => [entry.id, entry]));
          setOnlineProfiles(userIds.map((id) => profileById.get(id)).filter(Boolean) as OnlinePeerProfile[]);
        }
      } catch (error) {
        if (!cancelled && !isMissingOptionalPresenceTable(error)) {
          console.warn("Could not update online peer presence.", error);
        }
        if (!cancelled) setOnlineProfiles([]);
      }
    };

    void refreshPresence();
    const interval = window.setInterval(refreshPresence, ONLINE_PEER_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [bundle?.page.id, profile?.id]);

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
    scene.add(createIsometricTerrain());

    const peerRoot = new THREE.Group();
    scene.add(peerRoot);
    const doorRoot = new THREE.Group();
    scene.add(doorRoot);
    const playerMarker = new THREE.Group();
    scene.add(playerMarker);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();
    let animation = 0;
    let currentPeerKey = "";
    let currentDoorKey = "";
    let currentPlayerKey = "";
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
      const key = peersRef.current
        .map((peer) => `${peer.id}:${peer.label}:${peer.message}:${peer.chatBubble?.body ?? ""}:${peer.chatBubble?.createdAt ?? ""}:${peer.avatarUrl ?? ""}:${peer.clothingUrl ?? ""}:${peer.character.body}:${peer.character.accent}:${peer.character.head}:${peer.character.style}`)
        .join("|");
      if (key === currentPeerKey) return;
      currentPeerKey = key;
      peerRoot.clear();

      for (let index = 0; index < peersRef.current.length; index += 1) {
        peerRoot.add(createPeerAvatar(peersRef.current[index], index));
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

    const refreshPlayerMarker = () => {
      const playerAvatar = playerAvatarRef.current;
      const key = `${playerAvatar.avatarUrl ?? ""}:${playerAvatar.clothingUrl ?? ""}:${playerAvatar.character.body}:${playerAvatar.character.accent}:${playerAvatar.character.head}:${playerAvatar.character.style}`;
      if (key === currentPlayerKey) return;
      currentPlayerKey = key;
      playerMarker.clear();
      playerMarker.add(createCharacterModel(
        playerAvatar.character,
        playerAvatar.avatarUrl,
        playerAvatar.clothingUrl,
        0,
      ));
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
      refreshPlayerMarker();
      positionCamera(camera, playerRef.current);
      playerMarker.position.set(playerRef.current.x, 0.02, playerRef.current.z);
      playerMarker.rotation.y = playerRef.current.yaw;
      peerRoot.children.forEach((child: any, index: number) => {
        animatePeer(child, index, performance.now() * 0.001);
      });
      updateSpeechBubbles(peerRoot, Date.now());
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
          <PeerTitleIcon />
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
            <strong>Isometric view: WASD to walk, arrows to turn</strong>
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
              onClick={() => setPlayer((current) => ({ ...current, mode: cycleCameraMode(current.mode) }))}
            >
              {player.mode === "iso" ? "Third person" : player.mode === "third" ? "First person" : "Isometric"}
            </button>
            <button type="button" onClick={() => setPlayer({ ...PLAYER_START })}>Reset</button>
          </div>
        </div>
      </section>
    </main>
  );

  function updatePlayerFromKeys(delta: number) {
    const keys = keysRef.current;
    const forward = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    const strafe = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
    const turn =
      (keys.has("arrowright") || keys.has("e") ? 1 : 0) -
      (keys.has("arrowleft") || keys.has("q") ? 1 : 0);
    const look =
      (keys.has("arrowup") ? 1 : 0) -
      (keys.has("arrowdown") ? 1 : 0);

    if (!forward && !strafe && !turn && !look) {
      return;
    }

    setPlayer((current) => {
      const next = forward || strafe
        ? movePlayer(current, forward, strafe, delta * 4.8)
        : { ...current };

      if (turn) {
        next.yaw -= turn * delta * 2.4;
      }

      if (look) {
        next.pitch = clamp(next.pitch + look * delta * 1.5, -0.55, 0.55);
      }

      return next;
    });
  }
}

function buildWebsiteRouteDoors({
  rawUrl,
  currentUrl,
  domainUrl,
  routes: savedRoutes,
  posts,
}: {
  rawUrl: string | null;
  currentUrl: string;
  domainUrl: string;
  routes: PageRouteRecord[];
  posts: PostRecord[];
}): DoorNode[] {
  const baseUrl = parseRouteUrl(rawUrl) ?? parseRouteUrl(currentUrl) ?? parseRouteUrl(domainUrl);
  if (!baseUrl || baseUrl.hostname === "global.pairpod.local") {
    return [];
  }

  const routes = new Map<string, { path: string; source: string }>();
  const addRoute = (path: string, source: string) => {
    const normalized = normalizeRoutePath(path);
    if (!normalized || routes.has(normalized)) {
      return;
    }
    routes.set(normalized, { path: normalized, source });
  };

  addRoute("/", "site root");

  for (const route of savedRoutes) {
    addRoute(route.path, route.source || "saved route");
  }

  if (baseUrl.pathname !== "/" || baseUrl.search) {
    addRoute(`${baseUrl.pathname}${baseUrl.search}`, "current page");
  }

  const segments = baseUrl.pathname.split("/").filter(Boolean);
  for (let index = 0; index < segments.length - 1; index += 1) {
    addRoute(`/${segments.slice(0, index + 1).join("/")}`, "parent route");
  }

  for (const post of posts) {
    const sectionRoute = normalizePostSectionRoute(post.section_id);
    if (sectionRoute) {
      addRoute(sectionRoute, "post route");
    }
  }

  return [...routes.values()].slice(0, 6).map((route, index, allRoutes) => {
    const angle = allRoutes.length === 1
      ? Math.PI / 2
      : Math.PI * 0.08 + (Math.PI * 0.84 * index) / Math.max(1, allRoutes.length - 1);
    const routeUrl = new URL(route.path, baseUrl.origin);
    return {
      id: `site-route-${index}-${route.path}`,
      label: formatRouteDoorLabel(route.path),
      subtitle: route.source,
      href: routeUrl.toString(),
      color: ROUTE_DOOR_COLORS[index % ROUTE_DOOR_COLORS.length],
      x: Math.cos(angle) * 12,
      z: Math.sin(angle) * 12 + 2.5,
      rotation: Math.PI - angle,
    };
  });
}

function formatRouteDoorLabel(path: string) {
  const label = path === "/" ? "/" : path.replace(/^\//, "");
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

const ROUTE_DOOR_COLORS = ["#14a3a0", "#2d90ff", "#e95f9f", "#ff8c28", "#7a5cff", "#44b834"];

function parseRouteUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function normalizePostSectionRoute(sectionId: string | null) {
  if (!sectionId) {
    return null;
  }

  const trimmed = sectionId.trim();
  if (!trimmed || trimmed === "general" || trimmed.startsWith("post:")) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = parseRouteUrl(trimmed);
    return parsed ? `${parsed.pathname}${parsed.search}` : null;
  }

  if (trimmed.startsWith("/") || trimmed.includes("/")) {
    return normalizeRoutePath(trimmed);
  }

  return null;
}

function normalizeRoutePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const [pathPart, searchPart = ""] = trimmed.split("?");
  const path = `/${pathPart.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  const normalizedPath = path === "/" ? "/" : path;
  const normalizedSearch = searchPart ? `?${searchPart}` : "";
  return `${normalizedPath}${normalizedSearch}`;
}

function PeerTitleIcon() {
  return (
    <svg className="xp-title-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="9.4" rx="6" ry="5.5" fill="#6ebe44" stroke="#2d7018" strokeWidth="0.9" />
      <line x1="8" y1="4.3" x2="8" y2="1.7" stroke="#2d7018" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="1.8" r="1.4" fill="#8cd960" />
      <circle cx="10" cy="2.2" r="1.1" fill="#6ebe44" />
      <circle cx="6.3" cy="8.8" r="1.3" fill="white" />
      <circle cx="9.7" cy="8.8" r="1.3" fill="white" />
      <circle cx="6.5" cy="9" r="0.55" fill="#1a2a44" />
      <circle cx="9.9" cy="9" r="0.55" fill="#1a2a44" />
      <path d="M6.2 12c1.1.9 2.5.9 3.6 0" stroke="#2d5018" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

function createPeerAvatar(peer: PeerNode, index: number) {
  const group = new THREE.Group();
  group.position.set(peer.x, 0, peer.z);
  group.userData.homeX = peer.x;
  group.userData.homeZ = peer.z;
  group.userData.wanderSeed = index * 1.73 + peer.id.length * 0.37;

  const model = createCharacterModel(peer.character, peer.avatarUrl, peer.clothingUrl, index);
  group.add(model);

  const accent = new THREE.Color(peer.character.accent);
  const beacon = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.035, 8, 40),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8 }),
  );
  beacon.position.y = 0.04;
  beacon.rotation.x = Math.PI / 2;
  group.add(beacon);

  const label = createLabelSprite(peer.label);
  label.position.y = 2.25;
  group.add(label);

  if (peer.chatBubble) {
    const speech = createSpeechSprite(peer.chatBubble.body, peer.chatBubble.createdAt);
    speech.position.y = 3.05;
    group.add(speech);
  }
  return group;
}

function createCharacterModel(
  character: Character3dConfig,
  avatarUrl: string | null,
  clothingUrl: string | null,
  index: number,
) {
  const group = new THREE.Group();
  const color = new THREE.Color(character.body || DEFAULT_CHARACTER_3D.body);
  const accent = new THREE.Color(character.accent);
  const headColor = new THREE.Color(character.head);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  applyOptionalTexture(bodyMaterial, clothingUrl);
  const body = new THREE.Mesh(
    character.style === "bot"
      ? new THREE.BoxGeometry(0.6, 0.9, 0.48)
      : character.style === "runner"
        ? new THREE.CapsuleGeometry(0.3, 0.72, 6, 12)
        : new THREE.CapsuleGeometry(0.3, 0.72, 6, 12),
    bodyMaterial,
  );
  body.position.y = 0.78;
  body.castShadow = true;
  group.add(body);

  const headMaterial = new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.7 });
  applyOptionalTexture(headMaterial, avatarUrl);
  const head = new THREE.Mesh(
    character.style === "bot"
      ? new THREE.BoxGeometry(0.48, 0.48, 0.48)
      : new THREE.SphereGeometry(0.3, 24, 16),
    headMaterial,
  );
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);

  if (character.style === "runner") {
    const limbMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.62 });
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.12), limbMaterial);
    leftLeg.position.set(-0.18, 0.25, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.12), limbMaterial);
    rightLeg.position.set(0.18, 0.25, 0);
    group.add(leftLeg, rightLeg);
  }

  if (character.style === "bot" || character.style === "pod") {
    const antenna = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    antenna.position.set(0, 1.98, 0);
    group.add(antenna);
  }

  return group;
}

function applyOptionalTexture(material: any, imageUrl: string | null) {
  if (!imageUrl) {
    return;
  }

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const texture = loader.load(
    imageUrl,
    (loadedTexture: any) => {
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.wrapS = THREE.RepeatWrapping;
      loadedTexture.wrapT = THREE.RepeatWrapping;
      loadedTexture.needsUpdate = true;
      material.needsUpdate = true;
    },
    undefined,
    () => {
      material.map = null;
      material.needsUpdate = true;
    },
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  material.needsUpdate = true;
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

function createIsometricTerrain() {
  const group = new THREE.Group();
  const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c28f, roughness: 0.9 });
  const plazaMaterial = new THREE.MeshStandardMaterial({ color: 0xbbe18f, roughness: 0.86 });
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x7f9ca5, roughness: 0.72 });

  const plaza = new THREE.Mesh(new THREE.BoxGeometry(9, 0.16, 9), plazaMaterial);
  plaza.position.set(0, 0.055, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  for (const [x, z, rotation, length] of [
    [0, -7, 0, 11],
    [7, 1, Math.PI / 2, 10],
    [-7, 1, Math.PI / 2, 10],
    [0, 8, 0, 8],
  ] as const) {
    const path = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, length), pathMaterial);
    path.position.set(x, 0.08, z);
    path.rotation.y = rotation;
    path.receiveShadow = true;
    group.add(path);
  }

  for (const [x, z] of [
    [-5, -5],
    [5, -5],
    [-5, 5],
    [5, 5],
    [-11, -2],
    [11, -2],
  ] as const) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.9), stoneMaterial);
    stone.position.set(x, 0.22, z);
    stone.rotation.y = Math.PI * 0.25;
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

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

const CHAT_BUBBLE_VISIBLE_MS = 5200;

function createSpeechSprite(message: string, createdAt: string) {
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
  sprite.userData.speechCreatedAt = new Date(createdAt).getTime();
  sprite.scale.set(3.6, 1.02, 1);
  return sprite;
}

function updateSpeechBubbles(peerRoot: any, now: number) {
  peerRoot.traverse((child: any) => {
    const createdAt = Number(child.userData?.speechCreatedAt);
    if (!createdAt || !child.material) {
      return;
    }

    const age = now - createdAt;
    const fadeStart = CHAT_BUBBLE_VISIBLE_MS * 0.62;
    const opacity = age <= fadeStart
      ? 1
      : Math.max(0, 1 - (age - fadeStart) / (CHAT_BUBBLE_VISIBLE_MS - fadeStart));

    child.visible = opacity > 0.02;
    child.material.opacity = opacity;
  });
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
  const lookTarget = position.clone().add(direction.clone().multiplyScalar(8));

  if (player.mode === "first") {
    camera.position.copy(position);
    camera.lookAt(lookTarget);
    return;
  }

  if (player.mode === "iso") {
    const isoOffset = new THREE.Vector3(
      -Math.sin(player.yaw) * 10,
      9.5,
      -Math.cos(player.yaw) * 10,
    );
    camera.position.copy(position.clone().add(isoOffset));
    camera.lookAt(position.x, 0.9 + player.pitch * 2.2, position.z);
    return;
  }

  const behind = new THREE.Vector3(-Math.sin(player.yaw) * 6, 4.2, -Math.cos(player.yaw) * 6);
  camera.position.copy(position.clone().add(behind));
  camera.lookAt(lookTarget);
}

function cycleCameraMode(mode: PlayerState["mode"]): PlayerState["mode"] {
  if (mode === "iso") {
    return "third";
  }

  if (mode === "third") {
    return "first";
  }

  return "iso";
}

function movePlayer(current: PlayerState, forward: number, strafe: number, distance: number): PlayerState {
  const sin = Math.sin(current.yaw);
  const cos = Math.cos(current.yaw);
  const magnitude = Math.max(1, Math.hypot(forward, strafe));
  const normalizedForward = forward / magnitude;
  const normalizedStrafe = strafe / magnitude;
  return {
    ...current,
    x: clamp(current.x + (sin * normalizedForward - cos * normalizedStrafe) * distance, -28, 28),
    z: clamp(current.z + (cos * normalizedForward + sin * normalizedStrafe) * distance, -28, 28),
  };
}

function isMovementKey(key: string) {
  return ["w", "a", "s", "d", "q", "e", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key.toLowerCase());
}

function isMissingOptionalPresenceTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  const message = candidate.message?.toLowerCase() ?? "";
  return candidate.code === "42P01" || message.includes("page_presence");
}

function isAiFakeUser(user: UserProfileRecord | null | undefined) {
  const configurations = user?.configurations;
  return (
    configurations !== null &&
    typeof configurations === "object" &&
    !Array.isArray(configurations) &&
    configurations.kind === "ai_fake_user"
  );
}

function truncateCanvasText(value: string, maxLength: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}

function readCharacter3d(configurations: Json | undefined): Character3dConfig {
  if (!configurations || typeof configurations !== "object" || Array.isArray(configurations)) {
    return DEFAULT_CHARACTER_3D;
  }

  const source = configurations.character3d;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return DEFAULT_CHARACTER_3D;
  }

  const candidate = source as Partial<Character3dConfig>;
  return {
    body: normalizeColor(candidate.body) ?? DEFAULT_CHARACTER_3D.body,
    accent: normalizeColor(candidate.accent) ?? DEFAULT_CHARACTER_3D.accent,
    head: normalizeColor(candidate.head) ?? DEFAULT_CHARACTER_3D.head,
    style: candidate.style === "runner" || candidate.style === "bot" ? candidate.style : "pod",
    clothingImageUrl: normalizeImageUrl(candidate.clothingImageUrl),
  };
}

function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function normalizeImageUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
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
