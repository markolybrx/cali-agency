import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  OFFICE_HEIGHT,
  OFFICE_WIDTH,
  type PacketFlight,
  type PixelSpriteAgent,
  stepOfficeSimulation
} from './pixelOffice';

interface Claw3DOfficeProps {
  agentsRef: React.MutableRefObject<PixelSpriteAgent[]>;
  packetsRef: React.MutableRefObject<PacketFlight[]>;
  selectedAgentId: string | null;
  onSelectAgent: (agent: PixelSpriteAgent | null) => void;
}

interface ProjectedLabel {
  id: string;
  shortName: string;
  state: string;
  speech: string;
  x: number;
  y: number;
  visible: boolean;
}

interface AgentRig {
  root: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  head: THREE.Group;
  ring: THREE.Mesh;
  agentId: string;
}

type CameraPreset = 'iso' | 'top' | 'cali' | 'follow';

const WORLD_W = 24;
const WORLD_D = 15;

function toWorldX(simX: number): number {
  return (simX / OFFICE_WIDTH - 0.5) * WORLD_W;
}

function toWorldZ(simY: number): number {
  return (simY / OFFICE_HEIGHT - 0.5) * WORLD_D;
}

function buildAvatarRig(agent: PixelSpriteAgent): AgentRig {
  const root = new THREE.Group();
  root.userData.agentId = agent.id;

  const legMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: agent.shirt, roughness: 0.65 });
  const skinMat = new THREE.MeshStandardMaterial({ color: agent.skin, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: agent.hair, roughness: 0.75 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#111827' });

  // Selection ring on floor
  const ringGeo = new THREE.RingGeometry(0.42, 0.54, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#FFB732', side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.16, 0.42, 0.16);
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.11, 0.21, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.11, 0.21, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.26), shirtMat);
  torso.position.set(0, 0.66, 0);
  torso.castShadow = true;
  torso.userData.agentId = agent.id;
  root.add(torso);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.14, 0.42, 0.14);
  const leftArm = new THREE.Mesh(armGeo, shirtMat);
  leftArm.position.set(-0.3, 0.68, 0);
  leftArm.castShadow = true;
  root.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, shirtMat);
  rightArm.position.set(0.3, 0.68, 0);
  rightArm.castShadow = true;
  root.add(rightArm);

  // Head group
  const head = new THREE.Group();
  head.position.set(0, 1.14, 0);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skinMat);
  skull.castShadow = true;
  skull.userData.agentId = agent.id;
  head.add(skull);

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.44), hairMat);
  hairTop.position.set(0, 0.18, -0.01);
  head.add(hairTop);

  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.12), hairMat);
  hairBack.position.set(0, 0.02, -0.18);
  head.add(hairBack);

  const eyeGeo = new THREE.BoxGeometry(0.06, 0.07, 0.03);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.1, 0.01, 0.2);
  head.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.1, 0.01, 0.2);
  head.add(rightEye);

  root.add(head);

  return { root, leftLeg, rightLeg, leftArm, rightArm, head, ring, agentId: agent.id };
}

function buildRetroOfficeEnvironment(scene: THREE.Scene): { serverLeds: THREE.Mesh[]; monitorScreens: THREE.Mesh[] } {
  const serverLeds: THREE.Mesh[] = [];
  const monitorScreens: THREE.Mesh[] = [];

  // 1. Main Warm Hardwood Floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_W, 0.3, WORLD_D),
    new THREE.MeshStandardMaterial({ color: '#B87B44', roughness: 0.82 })
  );
  floor.position.set(0, -0.15, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // Subtle floor plank grooves
  const grooveMat = new THREE.MeshBasicMaterial({ color: '#8C582B' });
  for (let z = -WORLD_D / 2 + 1; z < WORLD_D / 2; z += 1.2) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W - 0.4, 0.01, 0.03), grooveMat);
    strip.position.set(0, 0.006, z);
    scene.add(strip);
  }

  // 2. Cutaway Back Walls (North + West for true isometric Claw3D visibility)
  const wallMat = new THREE.MeshStandardMaterial({ color: '#3E2B1E', roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#6E4A2E', roughness: 0.75 });

  const northWall = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W + 0.4, 3.2, 0.35), wallMat);
  northWall.position.set(0, 1.6, -WORLD_D / 2 - 0.15);
  northWall.receiveShadow = true;
  scene.add(northWall);

  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, WORLD_D + 0.4), wallMat);
  westWall.position.set(-WORLD_W / 2 - 0.15, 1.6, 0);
  westWall.receiveShadow = true;
  scene.add(westWall);

  // Wall-mounted glowing sign on North Wall
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.72, 0.14), trimMat);
  signFrame.position.set(-1.5, 2.35, -WORLD_D / 2 + 0.06);
  scene.add(signFrame);
  const signGlow = new THREE.Mesh(
    new THREE.BoxGeometry(4.3, 0.5, 0.08),
    new THREE.MeshStandardMaterial({ color: '#6C4CD1', emissive: '#6C4CD1', emissiveIntensity: 0.65 })
  );
  signGlow.position.set(-1.5, 2.35, -WORLD_D / 2 + 0.12);
  scene.add(signGlow);

  // Glowing Daylight Windows on West Wall
  const winMat = new THREE.MeshStandardMaterial({ color: '#BAE6FD', emissive: '#7DD3FC', emissiveIntensity: 0.45 });
  for (const wz of [-3.6, 1.8]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 2.8), winMat);
    win.position.set(-WORLD_W / 2 + 0.05, 1.75, wz);
    scene.add(win);
  }

  // 3. Kitchenette Counter + Coffee Machine (North-West)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.9, 1.1), trimMat);
  counter.position.set(-9.2, 0.45, -6.5);
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);

  const espresso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.65, 0.5),
    new THREE.MeshStandardMaterial({ color: '#27272A', metalness: 0.5, roughness: 0.35 })
  );
  espresso.position.set(-8.2, 1.22, -6.55);
  espresso.castShadow = true;
  scene.add(espresso);

  // 4. Bookshelves (North-Center)
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.1, 0.65), new THREE.MeshStandardMaterial({ color: '#5A371E', roughness: 0.85 }));
  shelf.position.set(2.4, 1.05, -6.95);
  shelf.castShadow = true;
  scene.add(shelf);
  const bookPalette = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];
  for (let row = 0; row < 3; row++) {
    for (let b = 0; b < 7; b++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.38, 0.42),
        new THREE.MeshStandardMaterial({ color: bookPalette[(row * 3 + b) % bookPalette.length] })
      );
      book.position.set(1.35 + b * 0.33, 0.45 + row * 0.62, -6.82);
      scene.add(book);
    }
  }

  // 5. Top-Right Glass-Walled Cali Executive & Conference Suite (Teal Carpet + Oval Table)
  const confCarpet = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 0.04, 5.4),
    new THREE.MeshStandardMaterial({ color: '#1F4B52', roughness: 0.95 })
  );
  confCarpet.position.set(8.4, 0.02, -4.4);
  confCarpet.receiveShadow = true;
  scene.add(confCarpet);

  // Glass Partition Walls
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#99F6E4',
    transparent: true,
    opacity: 0.24,
    roughness: 0.1,
    metalness: 0.1
  });
  const glassLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 5.4), glassMat);
  glassLeft.position.set(5.2, 1.15, -4.4);
  scene.add(glassLeft);

  const glassFront = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.3, 0.12), glassMat);
  glassFront.position.set(9.4, 1.15, -1.7);
  scene.add(glassFront);

  // Oval Conference Table
  const confTop = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.55, 0.14, 24),
    new THREE.MeshStandardMaterial({ color: '#784824', roughness: 0.6 })
  );
  confTop.scale.set(1.25, 1, 0.78);
  confTop.position.set(8.5, 0.76, -4.3);
  confTop.castShadow = true;
  confTop.receiveShadow = true;
  scene.add(confTop);

  const confBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 0.74, 12), trimMat);
  confBase.position.set(8.5, 0.37, -4.3);
  scene.add(confBase);

  // 6. Server / QA Rack Corner (Back-Right)
  const rackMat = new THREE.MeshStandardMaterial({ color: '#18181B', metalness: 0.4, roughness: 0.5 });
  for (let r = 0; r < 2; r++) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.15, 0.8), rackMat);
    rack.position.set(10.9, 1.08, -6.5 + r * 1.1);
    rack.castShadow = true;
    scene.add(rack);
    for (let l = 0; l < 4; l++) {
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.22),
        new THREE.MeshBasicMaterial({ color: l % 2 === 0 ? '#34D399' : '#8B5CF6' })
      );
      led.position.set(10.45, 0.6 + l * 0.4, -6.5 + r * 1.1);
      scene.add(led);
      serverLeds.push(led);
    }
  }

  // 7. Bottom-Right Cozy Break Lounge (Rug + Red 3D Couches + Coffee Table)
  const loungeRug = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.04, 6.2),
    new THREE.MeshStandardMaterial({ color: '#6E3F24', roughness: 0.95 })
  );
  loungeRug.position.set(8.5, 0.02, 3.8);
  loungeRug.receiveShadow = true;
  scene.add(loungeRug);

  const sofaMat = new THREE.MeshStandardMaterial({ color: '#B91C1C', roughness: 0.85 });
  const buildSofa = (sx: number, sz: number, rotY: number) => {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 2.4), sofaMat);
    seat.position.set(0, 0.21, 0);
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.82, 2.4), sofaMat);
    back.position.set(-0.32, 0.46, 0);
    back.castShadow = true;
    g.add(back);
    g.position.set(sx, 0, sz);
    g.rotation.y = rotY;
    scene.add(g);
  };
  buildSofa(6.3, 4.0, 0);
  buildSofa(10.7, 4.0, Math.PI);

  const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.44, 1.8), trimMat);
  coffeeTable.position.set(8.5, 0.22, 4.0);
  coffeeTable.castShadow = true;
  scene.add(coffeeTable);

  // 8. 3×3 Procedural Wooden Workstations (Desk + Swivel Chair + Monitor)
  const deskCols = [132, 252, 372];
  const deskRows = [148, 226, 304];
  const deskWoodMat = new THREE.MeshStandardMaterial({ color: '#8C562B', roughness: 0.72 });
  const monitorBodyMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.4 });
  const chairMat = new THREE.MeshStandardMaterial({ color: '#27272A', roughness: 0.75 });

  for (const ry of deskRows) {
    for (const cx of deskCols) {
      const wx = toWorldX(cx);
      const wz = toWorldZ(ry);

      // Desk top + legs
      const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.12, 1.15), deskWoodMat);
      deskTop.position.set(wx, 0.74, wz + 0.35);
      deskTop.castShadow = true;
      deskTop.receiveShadow = true;
      scene.add(deskTop);

      for (const lx of [-1.05, 1.05]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.74, 1.02), trimMat);
        leg.position.set(wx + lx, 0.37, wz + 0.35);
        leg.castShadow = true;
        scene.add(leg);
      }

      // Monitor + Glowing Screen
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.08), monitorBodyMat);
      mon.position.set(wx, 1.14, wz + 0.48);
      mon.castShadow = true;
      scene.add(mon);

      const scr = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.46, 0.03),
        new THREE.MeshStandardMaterial({ color: '#38BDF8', emissive: '#0284C7', emissiveIntensity: 0.55 })
      );
      scr.position.set(wx, 1.14, wz + 0.43);
      scene.add(scr);
      monitorScreens.push(scr);

      // Chair behind desk
      const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.62), chairMat);
      chairSeat.position.set(wx, 0.42, wz - 0.52);
      scene.add(chairSeat);
      const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.1), chairMat);
      chairBack.position.set(wx, 0.76, wz - 0.8);
      scene.add(chairBack);
    }
  }

  // 9. Potted Plants around the floor
  const potMat = new THREE.MeshStandardMaterial({ color: '#9A3412', roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#16A34A', roughness: 0.75 });
  const plantSpots: Array<[number, number]> = [
    [-10.8, -4.6],
    [-10.8, 6.2],
    [4.4, -6.4],
    [4.4, 6.2]
  ];
  for (const [px, pz] of plantSpots) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.55, 8), potMat);
    pot.position.set(px, 0.28, pz);
    pot.castShadow = true;
    scene.add(pot);
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), leafMat);
    bush.position.set(px, 0.86, pz);
    bush.castShadow = true;
    scene.add(bush);
  }

  return { serverLeds, monitorScreens };
}

export const Claw3DOffice: React.FC<Claw3DOfficeProps> = ({
  agentsRef,
  packetsRef,
  selectedAgentId,
  onSelectAgent
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('iso');
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const presetRef = useRef<CameraPreset>('iso');
  const selectedIdRef = useRef<string | null>(selectedAgentId);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    presetRef.current = preset;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    if (preset === 'iso') {
      cam.position.set(13.5, 13.5, 15.5);
      ctrl.target.set(0, 0.5, 0);
    } else if (preset === 'top') {
      cam.position.set(0, 22, 3.5);
      ctrl.target.set(0, 0, 0);
    } else if (preset === 'cali') {
      cam.position.set(12.5, 6.8, 2.2);
      ctrl.target.set(8.4, 1.0, -4.4);
    }
    ctrl.update();
  }, [preset]);

  useEffect(() => {
    selectedIdRef.current = selectedAgentId;
  }, [selectedAgentId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141118');
    scene.fog = new THREE.Fog('#141118', 28, 52);

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(13.5, 13.5, 15.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.target.set(0, 0.5, 0);
    controls.update();
    controlsRef.current = controls;

    // Warm Cozy Studio Lighting
    const hemi = new THREE.HemisphereLight('#FFF7ED', '#27272A', 0.95);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#FDE68A', 1.35);
    sun.position.set(-10, 18, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    scene.add(sun);

    const violetAccent = new THREE.PointLight('#8B5CF6', 1.6, 16);
    violetAccent.position.set(8.4, 3.4, -4.3);
    scene.add(violetAccent);

    const { serverLeds } = buildRetroOfficeEnvironment(scene);

    // Spawn 14 articulated 3D agent rigs
    const rigs = new Map<string, AgentRig>();
    for (const ag of agentsRef.current) {
      const rig = buildAvatarRig(ag);
      rig.root.position.set(toWorldX(ag.x), 0, toWorldZ(ag.y));
      scene.add(rig.root);
      rigs.set(ag.id, rig);
    }

    // Pool for glowing 3D handoff packets
    const packetGroup = new THREE.Group();
    scene.add(packetGroup);
    const packetGeo = new THREE.OctahedronGeometry(0.24, 0);
    const packetMat = new THREE.MeshStandardMaterial({
      color: '#FFB732',
      emissive: '#8B5CF6',
      emissiveIntensity: 0.9
    });

    // Raycaster for tapping 3D avatars
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownX = 0;
    let pointerDownY = 0;

    const onPointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 8) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const rigRoots = Array.from(rigs.values()).map((r) => r.root);
      const hits = raycaster.intersectObjects(rigRoots, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.agentId) obj = obj.parent;
        if (obj?.userData.agentId) {
          const found = agentsRef.current.find((a) => a.id === obj!.userData.agentId) || null;
          onSelectAgent(found ? { ...found } : null);
          return;
        }
      }
      onSelectAgent(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    let raf = 0;
    let tick = 0;
    const projVec = new THREE.Vector3();

    const animate = () => {
      tick += 1;
      stepOfficeSimulation(agentsRef.current, packetsRef.current, tick);

      // Blink server LEDs
      if (tick % 24 === 0) {
        serverLeds.forEach((led, idx) => {
          led.visible = ((tick / 24 + idx) % 3) !== 0;
        });
      }

      // Sync 3D avatar positions & articulated limb animations
      const nextLabels: ProjectedLabel[] = [];
      const cw = container.clientWidth || 360;
      const ch = container.clientHeight || 360;

      for (const ag of agentsRef.current) {
        const rig = rigs.get(ag.id);
        if (!rig) continue;

        const wx = toWorldX(ag.x);
        const wz = toWorldZ(ag.y);
        const dx = wx - rig.root.position.x;
        const dz = wz - rig.root.position.z;
        const moving = Math.hypot(dx, dz) > 0.008;

        rig.root.position.set(wx, 0, wz);
        if (moving) {
          rig.root.rotation.y = Math.atan2(dx, dz);
          const swing = Math.sin(ag.walkPhase) * 0.55;
          rig.leftLeg.rotation.x = swing;
          rig.rightLeg.rotation.x = -swing;
          rig.leftArm.rotation.x = -swing * 0.8;
          rig.rightArm.rotation.x = swing * 0.8;
          rig.root.position.y = Math.abs(Math.sin(ag.walkPhase)) * 0.08;
        } else {
          rig.root.rotation.y = 0;
          rig.leftLeg.rotation.x = 0;
          rig.rightLeg.rotation.x = 0;
          if (ag.state === 'CODING' || ag.state === 'REVIEWING') {
            rig.leftArm.rotation.x = -0.85 + Math.sin(tick * 0.35) * 0.18;
            rig.rightArm.rotation.x = -0.85 - Math.sin(tick * 0.35) * 0.18;
          } else {
            rig.leftArm.rotation.x = 0;
            rig.rightArm.rotation.x = 0;
          }
          rig.head.position.y = 1.14 + Math.sin(tick * 0.06 + ag.blinkOffset) * 0.015;
        }

        const isSel = selectedIdRef.current === ag.id;
        rig.ring.visible = isSel;

        // Follow Camera Mode
        if (presetRef.current === 'follow' && isSel) {
          controls.target.lerp(new THREE.Vector3(wx, 0.9, wz), 0.1);
        }

        // Project 3D head position to 2D overlay every 2 frames for crisp labels
        if (tick % 2 === 0) {
          projVec.set(wx, 1.72, wz).project(camera);
          const sx = (projVec.x * 0.5 + 0.5) * cw;
          const sy = (-projVec.y * 0.5 + 0.5) * ch;
          nextLabels.push({
            id: ag.id,
            shortName: ag.shortName,
            state: ag.state,
            speech: ag.speech,
            x: sx,
            y: sy,
            visible: projVec.z < 1 && sx > -40 && sx < cw + 40 && sy > -20 && sy < ch + 20
          });
        }
      }

      if (tick % 2 === 0) setLabels(nextLabels);

      // Render glowing 3D handoff packets arcing between desks
      while (packetGroup.children.length > packetsRef.current.length) {
        packetGroup.remove(packetGroup.children[packetGroup.children.length - 1]);
      }
      while (packetGroup.children.length < packetsRef.current.length) {
        packetGroup.add(new THREE.Mesh(packetGeo, packetMat));
      }
      packetsRef.current.forEach((pkt, i) => {
        const mesh = packetGroup.children[i];
        const x = toWorldX(pkt.fromX + (pkt.toX - pkt.fromX) * pkt.progress);
        const z = toWorldZ(pkt.fromY + (pkt.toY - pkt.fromY) * pkt.progress);
        const y = 1.2 + Math.sin(pkt.progress * Math.PI) * 2.1;
        mesh.position.set(x, y, z);
        mesh.rotation.y += 0.08;
        mesh.rotation.x += 0.05;
      });

      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, [agentsRef, packetsRef, onSelectAgent]);

  return (
    <div className="relative w-full h-[50vh] min-h-[320px] rounded-2xl overflow-hidden border border-current/15 bg-[#141118] shadow-2xl">
      {/* Three.js WebGL Mount */}
      <div ref={mountRef} className="w-full h-full touch-none" />

      {/* Projected 3D Nameplates & Live Speech Bubbles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((lb) => {
          if (!lb.visible) return null;
          const dotColor =
            lb.state === 'CODING'
              ? 'bg-emerald-400'
              : lb.state === 'REVIEWING' || lb.state === 'THINKING'
              ? 'bg-amber-400'
              : lb.state === 'BLOCKED'
              ? 'bg-rose-500'
              : lb.state === 'TALKING'
              ? 'bg-violet-300'
              : 'bg-zinc-400';
          return (
            <div
              key={lb.id}
              style={{ transform: `translate(-50%, -100%) translate(${Math.round(lb.x)}px, ${Math.round(lb.y)}px)` }}
              className="absolute top-0 left-0 flex flex-col items-center gap-1"
            >
              {lb.speech && (
                <div className="px-2 py-0.5 rounded-lg bg-white text-zinc-900 text-[9px] font-semibold shadow-md max-w-[140px] truncate border border-zinc-900/20">
                  {lb.speech}
                </div>
              )}
              <div className="px-2 py-0.5 rounded-full bg-[#121215]/88 border border-white/15 text-[#F4F4F5] text-[9px] font-mono flex items-center gap-1 shadow">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                <span>{lb.shortName}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Camera Presets Bar (Claw3D Orbit / Top / Cali Suite / Follow Agent) */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-1 p-1 rounded-full bg-black/65 backdrop-blur border border-white/10">
          {(
            [
              ['iso', 'Iso 3D'],
              ['top', 'Top'],
              ['cali', 'Cali Suite'],
              ['follow', 'Follow']
            ] as Array<[CameraPreset, string]>
          ).map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium cursor-pointer transition ${
                preset === id ? 'bg-[#6C4CD1] text-white' : 'text-zinc-300 hover:text-white'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <span className="px-2.5 py-1 rounded-full bg-black/60 text-zinc-300 text-[9px] font-mono backdrop-blur hidden sm:inline">
          Drag to Orbit • Pinch to Zoom
        </span>
      </div>
    </div>
  );
};
