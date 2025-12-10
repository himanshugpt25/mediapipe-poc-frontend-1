import { useEffect, useRef } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { POSE_CONNECTIONS } from '@mediapipe/pose';

function PoseTracker() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    // Initialize MediaPipe Pose
    const pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });

    // Configure Pose options
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    // Set up onResults callback
    pose.onResults(onResults);

    // Initialize camera
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

    // Cleanup function
    return () => {
      pose.close();
    };
  }, []);

  // Drawing callback function
  const onResults = (results) => {
    const canvasElement = canvasRef.current;
    const canvasCtx = canvasElement.getContext('2d');

    // Clear canvas with white background
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.fillStyle = '#FFFFFF';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw pose landmarks if detected
    if (results.poseLandmarks) {
      // Draw connections (skeleton) in green
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: '#00FF00',
        lineWidth: 4
      });

      // Draw landmarks (joints) in red
      drawLandmarks(canvasCtx, results.poseLandmarks, {
        color: '#FF0000',
        lineWidth: 2,
        radius: 6
      });
    }

    canvasCtx.restore();
  };

  return (
    <div style={{ display: 'flex', gap: '20px', padding: '20px' }}>
      {/* Left side: Hidden video element */}
      <div>
        <video
          ref={videoRef}
          style={{ display: 'none' }}
        />
      </div>

      {/* Right side: Canvas output with mirror effect */}
      <div>
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ 
            border: '2px solid #333',
            transform: 'scaleX(-1)'
          }}
        />
      </div>
    </div>
  );
}

export default PoseTracker;
