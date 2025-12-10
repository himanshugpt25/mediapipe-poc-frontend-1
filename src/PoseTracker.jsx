import { useEffect, useRef } from 'react';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

function PoseTracker() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const jointMeshesRef = useRef([]);
  const boneMeshesRef = useRef([]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create scene with black background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Create camera (closer and at eye level for human scale)
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 2.5;  // Closer to skeleton
    camera.position.y = 1.0;  // Eye level
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Add GridHelper for floor reference (XZ plane)
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Add Three-Point Lighting System
    
    // 1. Ambient Light - soft base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // 2. Directional Light - main key light for depth and highlights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    
    // 3. Point Light - fill/accent light from the side
    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(-5, 5, 5);
    scene.add(pointLight);

    // Helper function to get scale/radius for each landmark
    const getScaleForLandmark = (index) => {
      // Face (0-10) or Hand tips (17-22): very small
      if ((index >= 0 && index <= 10) || (index >= 17 && index <= 22)) {
        return 0.02;
      }
      // Arms (11-16) or Body/Legs (23-32): standard
      return 0.05;
    };

    // Helper function to get color for each landmark
    const getColorForLandmark = (index) => {
      // Face (0-10) or Hand tips (17-22): Yellow
      if ((index >= 0 && index <= 10) || (index >= 17 && index <= 22)) {
        return 0xffff00; // Yellow
      }
      // Arms (11-16) or Body/Legs (23-32): Green
      return 0x00ff00; // Green
    };

    // Create 33 spheres for joints with varying sizes and colors
    for (let i = 0; i < 33; i++) {
      const radius = getScaleForLandmark(i);
      const color = getColorForLandmark(i);
      
      const sphereGeometry = new THREE.SphereGeometry(radius, 16, 16);
      const sphereMaterial = new THREE.MeshStandardMaterial({ 
        color,
        metalness: 0.3,
        roughness: 0.4,
        emissive: color,
        emissiveIntensity: 0.1 // Subtle glow for "digital twin" effect
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      
      sphere.visible = false; // Hide until we get landmark data
      scene.add(sphere);
      jointMeshesRef.current.push(sphere);
    }

    // Create bone cylinders for connecting joints
    createBones(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Create bone cylinders based on POSE_CONNECTIONS
  const createBones = (scene) => {
    const cylinderMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00,
      metalness: 0.2,
      roughness: 0.6,
      emissive: 0x00ff00,
      emissiveIntensity: 0.05 // Very subtle glow
    });
    
    POSE_CONNECTIONS.forEach(() => {
      const geometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
      const cylinder = new THREE.Mesh(geometry, cylinderMaterial);
      cylinder.visible = false;
      scene.add(cylinder);
      boneMeshesRef.current.push(cylinder);
    });
  };

  // Update bone position and rotation between two points
  const updateBone = (bone, point1, point2) => {
    const direction = new THREE.Vector3().subVectors(point2, point1);
    const length = direction.length();
    
    bone.position.copy(point1).add(direction.multiplyScalar(0.5));
    bone.scale.y = length;
    bone.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    bone.visible = true;
  };

  // Initialize MediaPipe Pose
  useEffect(() => {
    const pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);

    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          await pose.send({ image: videoRef.current });
        },
        width: 1280,
        height: 720
      });
      camera.start();
    }

    return () => {
      pose.close();
    };
  }, []);

  // Update 3D scene with MediaPipe world landmarks
  const onResults = (results) => {
    if (!results.poseWorldLandmarks) {
      // Hide all meshes if no pose detected
      jointMeshesRef.current.forEach(mesh => mesh.visible = false);
      boneMeshesRef.current.forEach(mesh => mesh.visible = false);
      return;
    }

    // Update joint positions from world landmarks
    results.poseWorldLandmarks.forEach((landmark, index) => {
      const mesh = jointMeshesRef.current[index];
      if (mesh) {
        // Apply coordinate system conversion
        // MediaPipe: Y-down, Three.js: Y-up
        // Also mirror X axis for natural mirroring
        mesh.position.x = -landmark.x;
        mesh.position.y = -landmark.y;
        mesh.position.z = -landmark.z;
        mesh.visible = true;
      }
    });

    // Update bone connections
    POSE_CONNECTIONS.forEach((connection, index) => {
      const [startIdx, endIdx] = connection;
      const startLandmark = results.poseWorldLandmarks[startIdx];
      const endLandmark = results.poseWorldLandmarks[endIdx];
      
      if (startLandmark && endLandmark) {
        const point1 = new THREE.Vector3(
          -startLandmark.x,
          -startLandmark.y,
          -startLandmark.z
        );
        const point2 = new THREE.Vector3(
          -endLandmark.x,
          -endLandmark.y,
          -endLandmark.z
        );
        
        const bone = boneMeshesRef.current[index];
        if (bone) {
          updateBone(bone, point1, point2);
        }
      }
    });
  };

  return (
    <div style={{ display: 'flex', gap: '20px', padding: '20px' }}>
      {/* Hidden video element for webcam capture */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
      />

      {/* Three.js 3D scene container */}
      <div
        ref={containerRef}
        style={{
          width: '1280px',
          height: '720px',
          border: '2px solid #333'
        }}
      />
    </div>
  );
}

export default PoseTracker;
