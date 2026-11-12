import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import SpatialFallback from "./SpatialFallback";

interface SpatialSceneProps {
  progress?: number;
}

export default function SpatialScene({ progress = 0 }: SpatialSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldFallback, setShouldFallback] = useState<boolean | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const isVisibleRef = useRef<boolean>(true);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);
  const instancesRef = useRef<THREE.InstancedMesh | null>(null);
  const scanlineRef = useRef<THREE.Mesh | null>(null);
  const dataPointsRef = useRef<Array<{
    startPos: THREE.Vector3;
    midPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startRot: number;
    color: THREE.Color;
  }>>([]);

  // Check hardware and WebGL support
  useEffect(() => {
    if (typeof window === "undefined") return;

    const width = window.innerWidth;
    const concurrency = navigator.hardwareConcurrency || 4;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Check WebGL availability
    let hasWebGL = false;
    try {
      const canvas = document.createElement("canvas");
      hasWebGL = !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
    } catch {
      hasWebGL = false;
    }

    if (!hasWebGL || width < 768 || concurrency < 4 || prefersReducedMotion) {
      setShouldFallback(true);
    } else {
      setShouldFallback(false);
    }
  }, []);

  // Mouse move handler for subtle parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseRef.current = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Three.js scene setup
  useEffect(() => {
    if (shouldFallback !== false || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // Scene & Camera
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);

    container.appendChild(renderer.domElement);

    // Ambient light & directional light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x14b8a6, 1.2);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // Generate tokens (unstructured -> aligned -> structured key-value)
    const count = 120;
    const geometry = new THREE.PlaneGeometry(0.7, 0.12);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancesRef.current = instancedMesh;

    const dataPoints: typeof dataPointsRef.current = [];
    const dummy = new THREE.Object3D();

    // Palettes: Stone neutral, teal, and emerald
    const stoneColor = new THREE.Color(0x78716c);
    const tealColor = new THREE.Color(0x14b8a6);
    const emeraldColor = new THREE.Color(0x10b981);

    for (let i = 0; i < count; i++) {
      // 1. Scattered state (Unstructured)
      const startPos = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4.5,
        (Math.random() - 0.5) * 3
      );
      const startRot = (Math.random() - 0.5) * 0.8;

      // 2. Orderly row state (Preprocessed lines)
      const row = Math.floor(i / 10);
      const col = i % 10;
      const midPos = new THREE.Vector3(
        (col - 4.5) * 0.6,
        2.2 - row * 0.4,
        0
      );

      // 3. Structured key-value grid (Resolved JSON schema)
      const isKey = i % 2 === 0;
      const itemIdx = Math.floor(i / 2);
      const slotRow = itemIdx % 12;
      const endPos = new THREE.Vector3(
        isKey ? -1.8 : 1.2,
        2.0 - slotRow * 0.36,
        0
      );

      const color = i < 40 ? tealColor : (i % 5 === 0 ? emeraldColor : stoneColor);

      dataPoints.push({
        startPos,
        midPos,
        endPos,
        startRot,
        color,
      });

      dummy.position.copy(startPos);
      dummy.rotation.z = startRot;
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      instancedMesh.setColorAt(i, color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    scene.add(instancedMesh);
    dataPointsRef.current = dataPoints;

    // Scanline mesh
    const scanlineGeo = new THREE.PlaneGeometry(6, 0.04);
    const scanlineMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.9,
    });
    const scanline = new THREE.Mesh(scanlineGeo, scanlineMat);
    scanline.position.set(0, 3, 0.1);
    scanline.visible = false;
    scene.add(scanline);
    scanlineRef.current = scanline;

    // Visibility Observer to pause rendering when offscreen
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    // Resize handler
    const handleResize = () => {
      if (!container || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (!isVisibleRef.current) return;

      // Mouse parallax smooth dampening
      currentParallaxX += (mouseRef.current.x * 0.35 - currentParallaxX) * 0.05;
      currentParallaxY += (mouseRef.current.y * 0.25 - currentParallaxY) * 0.05;

      camera.position.x = currentParallaxX;
      camera.position.y = currentParallaxY;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      observer.disconnect();

      // Memory cleanup
      geometry.dispose();
      material.dispose();
      scanlineGeo.dispose();
      scanlineMat.dispose();
      renderer.dispose();

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [shouldFallback]);

  // Update positions based on scroll progress
  useEffect(() => {
    if (!instancesRef.current || dataPointsRef.current.length === 0) return;

    const mesh = instancesRef.current;
    const dataPoints = dataPointsRef.current;
    const dummy = new THREE.Object3D();
    const p = Math.max(0, Math.min(1, progress));

    // Phase 1 (0 to 0.45): Unstructured -> Aligned rows
    // Phase 2 (0.45 to 0.75): Scanline sweep
    // Phase 3 (0.75 to 1.0): Aligned -> Structured Key-Value slots
    for (let i = 0; i < dataPoints.length; i++) {
      const pt = dataPoints[i];

      let targetPos = new THREE.Vector3();
      let rotZ = 0;

      if (p <= 0.45) {
        const factor = p / 0.45;
        targetPos.lerpVectors(pt.startPos, pt.midPos, factor);
        rotZ = THREE.MathUtils.lerp(pt.startRot, 0, factor);
      } else if (p <= 0.75) {
        targetPos.copy(pt.midPos);
        rotZ = 0;
      } else {
        const factor = (p - 0.75) / 0.25;
        targetPos.lerpVectors(pt.midPos, pt.endPos, factor);
        rotZ = 0;
      }

      dummy.position.copy(targetPos);
      dummy.rotation.z = rotZ;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;

    // Scanline update
    if (scanlineRef.current) {
      if (p > 0.4 && p < 0.8) {
        scanlineRef.current.visible = true;
        const scanFactor = (p - 0.4) / 0.4;
        scanlineRef.current.position.y = 2.4 - scanFactor * 4.8;
      } else {
        scanlineRef.current.visible = false;
      }
    }
  }, [progress]);

  if (shouldFallback) {
    return <SpatialFallback progress={progress} />;
  }

  return (
    <div className="relative w-full h-[460px] md:h-[520px] rounded-2xl overflow-hidden border border-white/5 bg-[#050814]/90 flex items-center justify-center">
      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        aria-hidden="true"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Accessible description for screen readers */}
      <span className="sr-only">
        Interactive 3D visualization illustrating DocFlow&apos;s data transformation from scattered unstructured document tokens into structured JSON schema fields.
      </span>

      {/* Technical UI Overlay Indicators */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md text-[11px] font-mono text-stone-300">
        <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
        <span>SPATIAL TOKEN MODEL</span>
      </div>

      <div className="absolute bottom-4 right-4 z-10 text-[11px] font-mono text-stone-500">
        DPR: 1.5 · DEMAND_FRAMELOOP
      </div>
    </div>
  );
}
