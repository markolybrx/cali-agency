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
  productionPaused?: boolean;
  onSelectAgent: (agent: PixelSpriteAgent | null) => void;
  onPressEmergencyButton?: () => void;
  onTapSuggestionWall?: () => void;
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

type CameraPreset = 'iso' | 'top' | 'cali' | 'rec' | 'follow';

const WORLD_W = 26;
const WORLD_D = 18;

function toWorldX(simX: number): number {
  return (simX / OFFICE_WIDTH - 0.5) * 24;
}

function toWorldZ(simY: number): number {
  return (simY / OFFICE_HEIGHT - 0.5) * 14.5 - 1.0;
}

function buildAvatarRig(agent: PixelSpriteAgent): AgentRig {
  const root = new THREE.Group();
  root.userData.agentId = agent.id;

  const legMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: agent.shirt, roughness: 0.65 });
  const skinMat = new THREE.MeshStandardMaterial({ color: agent.skin, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: agent.hair, roughness: 0.75 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#111827' });

  const ringGeo = new THREE.RingGeometry(0.42, 0.54, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#FFB732', side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);

  const legGeo = new THREE.BoxGeometry(0.16, 0.42, 0.16);
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.11, 0.21, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.11, 0.21, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.26), shirtMat);
  torso.position.set(0, 0.66, 0);
  torso.castShadow = true;
  torso.userData.agentId = agent.id;
  root.add(torso);

  const armGeo = new THREE.BoxGeometry(0.14, 0.42, 0.14);
  const leftArm = new THREE.Mesh(armGeo, shirtMat);
  leftArm.position.set(-0.3, 0.68, 0);
  leftArm.castShadow = true;
  root.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, shirtMat);
  rightArm.position.set(0.3, 0.68, 0);
  rightArm.castShadow = true;
  root.add(rightArm);

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

function buildExpanded8RoomOffice(scene: THREE.Scene): {
  serverLeds: THREE.Mesh[];
  emergencyBtn: THREE.Mesh;
  arcadeScreen: THREE.Mesh;
} {
  const serverLeds: THREE.Mesh[] = [];

  // 1. Existing Warm Hardwood Floor (Expanded for Recreation, Pantry & Zen Wing)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_W, 0.3, WORLD_D),
    new THREE.MeshStandardMaterial({ color: '#B87B44', roughness: 0.82 })
  );
  floor.position.set(0, -0.15, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  const grooveMat = new THREE.MeshBasicMaterial({ color: '#8C582B' });
  for (let z = -WORLD_D / 2 + 1; z < WORLD_D / 2; z += 1.2) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W - 0.4, 0.01, 0.03), grooveMat);
    strip.position.set(0, 0.006, z);
    scene.add(strip);
  }

  // 2. Cutaway Back Walls (North + West)
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

  // Glowing CALI AI HQ Sign
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.72, 0.14), trimMat);
  signFrame.position.set(-1.5, 2.35, -WORLD_D / 2 + 0.06);
  scene.add(signFrame);
  const signGlow = new THREE.Mesh(
    new THREE.BoxGeometry(4.3, 0.5, 0.08),
    new THREE.MeshStandardMaterial({ color: '#6C4CD1', emissive: '#6C4CD1', emissiveIntensity: 0.65 })
  );
  signGlow.position.set(-1.5, 2.35, -WORLD_D / 2 + 0.12);
  scene.add(signGlow);

  // Daylight Windows on West Wall
  const winMat = new THREE.MeshStandardMaterial({ color: '#BAE6FD', emissive: '#7DD3FC', emissiveIntensity: 0.45 });
  for (const wz of [-4.4, 1.2]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 2.8), winMat);
    win.position.set(-WORLD_W / 2 + 0.05, 1.75, wz);
    scene.add(win);
  }

  // 3. Kitchenette & Pantry Counter (North-West)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.9, 1.1), trimMat);
  counter.position.set(-10.2, 0.45, -7.8);
  counter.castShadow = true;
  scene.add(counter);

  const espresso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.65, 0.5),
    new THREE.MeshStandardMaterial({ color: '#27272A', metalness: 0.5, roughness: 0.35 })
  );
  espresso.position.set(-9.2, 1.22, -7.85);
  scene.add(espresso);

  // 4. Bookshelves (North-Center)
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.1, 0.65), new THREE.MeshStandardMaterial({ color: '#5A371E', roughness: 0.85 }));
  shelf.position.set(2.2, 1.05, -8.3);
  scene.add(shelf);

  // 5. Glass Executive Suite & Grand Boardroom (Top-Right) + Tappable RED EMERGENCY BUTTON
  const confCarpet = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.04, 5.6),
    new THREE.MeshStandardMaterial({ color: '#1F4B52', roughness: 0.95 })
  );
  confCarpet.position.set(8.8, 0.02, -5.4);
  confCarpet.receiveShadow = true;
  scene.add(confCarpet);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#99F6E4',
    transparent: true,
    opacity: 0.24,
    roughness: 0.1,
    metalness: 0.1
  });
  const glassLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 5.6), glassMat);
  glassLeft.position.set(5.4, 1.15, -5.4);
  scene.add(glassLeft);

  const glassFront = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.3, 0.12), glassMat);
  glassFront.position.set(9.8, 1.15, -2.6);
  scene.add(glassFront);

  const confTop = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.14, 24),
    new THREE.MeshStandardMaterial({ color: '#784824', roughness: 0.6 })
  );
  confTop.scale.set(1.25, 1, 0.78);
  confTop.position.set(8.8, 0.76, -5.3);
  confTop.castShadow = true;
  scene.add(confTop);

  // Tappable Red Emergency Meeting Button on Boardroom Table
  const btnPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: '#27272A', metalness: 0.5 })
  );
  btnPedestal.position.set(8.8, 0.86, -5.3);
  scene.add(btnPedestal);

  const emergencyBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: '#DC2626', emissiveIntensity: 0.8 })
  );
  emergencyBtn.position.set(8.8, 0.94, -5.3);
  emergencyBtn.userData.interactive = 'emergency';
  scene.add(emergencyBtn);

  // 6. NEW: Suggestion Board Corkboard Wall (Outside Glass Boardroom, Tappable)
  const corkFrame = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.35, 0.14),
    new THREE.MeshStandardMaterial({ color: '#4A2C16' })
  );
  corkFrame.position.set(8.8, 1.45, -2.48);
  corkFrame.userData.interactive = 'suggestions';
  scene.add(corkFrame);

  const corkBoard = new THREE.Mesh(
    new THREE.BoxGeometry(2.95, 1.1, 0.16),
    new THREE.MeshStandardMaterial({ color: '#C69663', roughness: 0.9 })
  );
  corkBoard.position.set(8.8, 1.45, -2.47);
  corkBoard.userData.interactive = 'suggestions';
  scene.add(corkBoard);

  ['#FEF08A', '#A7F3D0', '#FBCFE8', '#BFDBFE'].forEach((col, i) => {
    const note = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.36, 0.04),
      new THREE.MeshBasicMaterial({ color: col })
    );
    note.position.set(7.75 + i * 0.68, 1.5 + (i % 2 === 0 ? 0.12 : -0.14), -2.37);
    note.userData.interactive = 'suggestions';
    scene.add(note);
  });

  // 7. NEW: 1-on-1 Coaching Pod (Acoustic Glass Booth)
  const podRug = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.04, 2.8),
    new THREE.MeshStandardMaterial({ color: '#5B4236', roughness: 0.92 })
  );
  podRug.position.set(6.8, 0.02, 0.2);
  scene.add(podRug);
  const podTable = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 0.85),
    new THREE.MeshStandardMaterial({ color: '#8B5A32' })
  );
  podTable.position.set(6.8, 0.35, 0.2);
  scene.add(podTable);

  // 8. Server / QA Racks (Back-Right)
  const rackMat = new THREE.MeshStandardMaterial({ color: '#18181B', metalness: 0.4, roughness: 0.5 });
  for (let r = 0; r < 2; r++) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.15, 0.8), rackMat);
    rack.position.set(11.8, 1.08, -7.6 + r * 1.1);
    scene.add(rack);
    for (let l = 0; l < 4; l++) {
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.22),
        new THREE.MeshBasicMaterial({ color: l % 2 === 0 ? '#34D399' : '#8B5CF6' })
      );
      led.position.set(11.35, 0.6 + l * 0.4, -7.6 + r * 1.1);
      scene.add(led);
      serverLeds.push(led);
    }
  }

  // 9. Existing 3x3 Wooden Workstations
  const deskCols = [132, 252, 372];
  const deskRows = [148, 226, 304];
  const deskWoodMat = new THREE.MeshStandardMaterial({ color: '#8C562B', roughness: 0.72 });
  const monitorBodyMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.4 });
  const chairMat = new THREE.MeshStandardMaterial({ color: '#27272A', roughness: 0.75 });

  for (const ry of deskRows) {
    for (const cx of deskCols) {
      const wx = toWorldX(cx);
      const wz = toWorldZ(ry);

      const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.12, 1.15), deskWoodMat);
      deskTop.position.set(wx, 0.74, wz + 0.35);
      deskTop.castShadow = true;
      scene.add(deskTop);

      for (const lx of [-1.05, 1.05]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.74, 1.02), trimMat);
        leg.position.set(wx + lx, 0.37, wz + 0.35);
        scene.add(leg);
      }

      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.08), monitorBodyMat);
      mon.position.set(wx, 1.14, wz + 0.48);
      scene.add(mon);

      const scr = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.46, 0.03),
        new THREE.MeshStandardMaterial({ color: '#38BDF8', emissive: '#0284C7', emissiveIntensity: 0.55 })
      );
      scr.position.set(wx, 1.14, wz + 0.43);
      scene.add(scr);

      const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.62), chairMat);
      chairSeat.position.set(wx, 0.42, wz - 0.52);
      scene.add(chairSeat);
    }
  }

  // 10. NEW SOUTH WING: Pantry & Cafe (South-West), Recreation/Arcade (South-Center), Unwind/Zen Room (South-East)
  // Pantry & Cafe
  const pantryTile = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.04, 4.4),
    new THREE.MeshStandardMaterial({ color: '#D6D3D1', roughness: 0.85 })
  );
  pantryTile.position.set(-8.6, 0.02, 6.2);
  scene.add(pantryTile);

  const fridge = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.0, 1.0),
    new THREE.MeshStandardMaterial({ color: '#94A3B8', metalness: 0.35, roughness: 0.4 })
  );
  fridge.position.set(-11.4, 1.0, 5.2);
  scene.add(fridge);

  const cafeBar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.85, 0.9), trimMat);
  cafeBar.position.set(-8.2, 0.43, 5.2);
  scene.add(cafeBar);

  // Recreation & Arcade Room
  const recCarpet = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.04, 4.4),
    new THREE.MeshStandardMaterial({ color: '#272361', roughness: 0.92 })
  );
  recCarpet.position.set(-0.6, 0.02, 6.2);
  scene.add(recCarpet);

  const arcadeBody = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.85, 0.9), rackMat);
  arcadeBody.position.set(-3.2, 0.93, 5.1);
  scene.add(arcadeBody);

  const arcadeScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.55, 0.08),
    new THREE.MeshStandardMaterial({ color: '#38BDF8', emissive: '#A855F7', emissiveIntensity: 0.85 })
  );
  arcadeScreen.position.set(-3.2, 1.28, 5.56);
  scene.add(arcadeScreen);

  const pingPong = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.72, 1.5),
    new THREE.MeshStandardMaterial({ color: '#2563EB', roughness: 0.5 })
  );
  pingPong.position.set(0.4, 0.36, 6.4);
  scene.add(pingPong);

  const pingNet = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.52), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }));
  pingNet.position.set(0.4, 0.78, 6.4);
  scene.add(pingNet);

  // Unwind / Zen & Break Lounge (South-East)
  const zenRug = new THREE.Mesh(
    new THREE.BoxGeometry(7.8, 0.04, 5.2),
    new THREE.MeshStandardMaterial({ color: '#4A3429', roughness: 0.95 })
  );
  zenRug.position.set(8.2, 0.02, 5.8);
  scene.add(zenRug);

  const sofaMat = new THREE.MeshStandardMaterial({ color: '#B91C1C', roughness: 0.85 });
  const zenChairMat = new THREE.MeshStandardMaterial({ color: '#047857', roughness: 0.85 });
  const sofa1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 2.3), sofaMat);
  sofa1.position.set(5.6, 0.28, 5.8);
  scene.add(sofa1);

  const zenChair = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.52, 1.8), zenChairMat);
  zenChair.position.set(10.6, 0.26, 5.8);
  scene.add(zenChair);

  const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.44, 1.8), trimMat);
  coffeeTable.position.set(8.1, 0.22, 5.8);
  scene.add(coffeeTable);

  return { serverLeds, emergencyBtn, arcadeScreen };
}

export const Claw3DOffice: React.FC<Claw3DOfficeProps> = ({
  agentsRef,
  packetsRef,
  selectedAgentId,
  productionPaused = false,
  onSelectAgent,
  onPressEmergencyButton,
  onTapSuggestionWall
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('iso');
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const presetRef = useRef<CameraPreset>('iso');
  const selectedIdRef = useRef<string | null>(selectedAgentId);
  const pausedRef = useRef<boolean>(productionPaused);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    pausedRef.current = productionPaused;
  }, [productionPaused]);

  useEffect(() => {
    presetRef.current = preset;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    if (preset === 'iso') {
      cam.position.set(15.5, 14.5, 17.5);
      ctrl.target.set(0, 0.5, 0);
    } else if (preset === 'top') {
      cam.position.set(0, 26, 3.5);
      ctrl.target.set(0, 0, 0);
    } else if (preset === 'cali') {
      cam.position.set(13.5, 7.2, 1.8);
      ctrl.target.set(8.8, 1.0, -5.3);
    } else if (preset === 'rec') {
      cam.position.set(1.5, 8.5, 15.5);
      ctrl.target.set(0, 0.6, 6.0);
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
    scene.fog = new THREE.Fog('#141118', 32, 58);

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 110);
    camera.position.set(15.5, 14.5, 17.5);
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
    controls.maxDistance = 34;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.target.set(0, 0.5, 0);
    controls.update();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight('#FFF7ED', '#27272A', 0.95));

    const sun = new THREE.DirectionalLight('#FDE68A', 1.3);
    sun.position.set(-10, 18, 9);
    sun.castShadow = true;
    scene.add(sun);

    const violetAccent = new THREE.PointLight('#8B5CF6', 1.6, 18);
    violetAccent.position.set(8.8, 3.4, -5.3);
    scene.add(violetAccent);

    const zenLamp = new THREE.PointLight('#F59E0B', 1.1, 12);
    zenLamp.position.set(8.2, 2.5, 5.8);
    scene.add(zenLamp);

    const { serverLeds, emergencyBtn, arcadeScreen } = buildExpanded8RoomOffice(scene);

    const rigs = new Map<string, AgentRig>();
    for (const ag of agentsRef.current) {
      const rig = buildAvatarRig(ag);
      rig.root.position.set(toWorldX(ag.x), 0, toWorldZ(ag.y));
      scene.add(rig.root);
      rigs.set(ag.id, rig);
    }

    const packetGroup = new THREE.Group();
    scene.add(packetGroup);
    const packetGeo = new THREE.OctahedronGeometry(0.24, 0);
    const packetMat = new THREE.MeshStandardMaterial({
      color: '#FFB732',
      emissive: '#8B5CF6',
      emissiveIntensity: 0.9
    });

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

      const allHits = raycaster.intersectObjects(scene.children, true);
      for (const hit of allHits) {
        if (hit.object.userData.interactive === 'emergency') {
          onPressEmergencyButton?.();
          return;
        }
        if (hit.object.userData.interactive === 'suggestions') {
          onTapSuggestionWall?.();
          return;
        }
        let obj: THREE.Object3D | null = hit.object;
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
      if (!pausedRef.current) {
        stepOfficeSimulation(agentsRef.current, packetsRef.current, tick);
      }

      if (tick % 24 === 0) {
        serverLeds.forEach((led, idx) => {
          led.visible = ((tick / 24 + idx) % 3) !== 0;
        });
        (emergencyBtn.material as THREE.MeshStandardMaterial).emissiveIntensity =
          Math.floor(tick / 24) % 2 === 0 ? 1.1 : 0.45;
        (arcadeScreen.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
          Math.floor(tick / 24) % 2 === 0 ? '#A855F7' : '#0EA5E9'
        );
      }

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
        const moving = !pausedRef.current && Math.hypot(dx, dz) > 0.008;

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
          if (!pausedRef.current && (ag.state === 'CODING' || ag.state === 'REVIEWING')) {
            rig.leftArm.rotation.x = -0.85 + Math.sin(tick * 0.35) * 0.18;
            rig.rightArm.rotation.x = -0.85 - Math.sin(tick * 0.35) * 0.18;
          } else {
            rig.leftArm.rotation.x = 0;
            rig.rightArm.rotation.x = 0;
          }
        }

        const isSel = selectedIdRef.current === ag.id;
        rig.ring.visible = isSel;

        if (presetRef.current === 'follow' && isSel) {
          controls.target.lerp(new THREE.Vector3(wx, 0.9, wz), 0.1);
        }

        if (tick % 2 === 0) {
          projVec.set(wx, 1.72, wz).project(camera);
          const sx = (projVec.x * 0.5 + 0.5) * cw;
          const sy = (-projVec.y * 0.5 + 0.5) * ch;
          nextLabels.push({
            id: ag.id,
            shortName: ag.shortName,
            state: pausedRef.current ? 'PAUSED' : ag.state,
            speech: ag.speech,
            x: sx,
            y: sy,
            visible: projVec.z < 1 && sx > -40 && sx < cw + 40 && sy > -20 && sy < ch + 20
          });
        }
      }

      if (tick % 2 === 0) setLabels(nextLabels);

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
  }, [agentsRef, packetsRef, onSelectAgent, onPressEmergencyButton, onTapSuggestionWall]);

  return (
    <div className="relative w-full h-[50vh] min-h-[320px] rounded-2xl overflow-hidden border border-current/15 bg-[#141118] shadow-2xl">
      <div ref={mountRef} className="w-full h-full touch-none" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((lb) => {
          if (!lb.visible) return null;
          const dotColor =
            lb.state === 'PAUSED'
              ? 'bg-rose-500'
              : lb.state === 'CODING'
              ? 'bg-emerald-400'
              : lb.state === 'REVIEWING' || lb.state === 'THINKING'
              ? 'bg-amber-400'
              : lb.state === 'BLOCKED'
              ? 'bg-rose-500'
              : 'bg-zinc-400';
          return (
            <div
              key={lb.id}
              style={{ transform: `translate(-50%, -100%) translate(${Math.round(lb.x)}px, ${Math.round(lb.y)}px)` }}
              className="absolute top-0 left-0 flex flex-col items-center gap-1"
            >
              {lb.speech && !productionPaused && (
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

      {/* Camera Presets Bar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-1 p-1 rounded-full bg-black/65 backdrop-blur border border-white/10">
          {(
            [
              ['iso', 'Iso 3D'],
              ['top', 'Top'],
              ['cali', 'Boardroom'],
              ['rec', 'Rec & Zen'],
              ['follow', 'Follow']
            ] as Array<[CameraPreset, string]>
          ).map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium cursor-pointer transition ${
                preset === id ? 'bg-[#8B5CF6] text-white' : 'text-zinc-300 hover:text-white'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
