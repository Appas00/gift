import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";
import "./App.css";

// ==============================
// CLOUDINARY VIDEO URL
// ==============================
const VIDEO_URL =
  "https://res.cloudinary.com/wgwuubzd/video/upload/v1790497334/video.mp4";

function App() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const mindarRef = useRef(null);
  const videoMeshRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mindarThree = null;
    let video = null;
    let mounted = true;

    const startAR = async () => {
      try {
        if (!containerRef.current) return;

        // ==============================
        // 1. CREATE MINDAR
        // ==============================
        mindarThree = new MindARThree({
          container: containerRef.current,
          imageTargetSrc: "/targets.mind",

          // Try rear camera first (phones).
          // Falls back to front camera on laptops.
          facingMode: "environment",

          // Tracking tuning
          maxTrack: 1,
          filterMinCF: 0.0001,
          filterBeta: 0.001,
          warmupTolerance: 5,
          missTolerance: 5,

          uiLoading: "no",
          uiScanning: "no",
          uiError: "no",
        });

        mindarRef.current = mindarThree;

        const { renderer, scene, camera } = mindarThree;

        // ==============================
        // 2. THREE.JS SETTINGS
        // ==============================
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);

        // ==============================
        // 3. CREATE VIDEO (from Cloudinary)
        // ==============================
        video = document.createElement("video");
        video.src = VIDEO_URL;

        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";

        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");

        video.preload = "auto";

        // 👇 Attach to DOM (hidden). Required by iOS Safari for playback.
        video.style.display = "none";
        document.body.appendChild(video);

        videoRef.current = video;

        // ==============================
        // 3a. WAIT FOR VIDEO METADATA
        // ==============================
        // Make sure Cloudinary video is ready before creating texture.
        await new Promise((resolve, reject) => {
          const onLoaded = () => {
            video.removeEventListener("loadedmetadata", onLoaded);
            video.removeEventListener("error", onError);
            resolve();
          };
          const onError = (e) => {
            video.removeEventListener("loadedmetadata", onLoaded);
            video.removeEventListener("error", onError);
            reject(
              new Error(
                "Failed to load Cloudinary video. Check URL / CORS."
              )
            );
          };

          video.addEventListener("loadedmetadata", onLoaded);
          video.addEventListener("error", onError);

          // If already loaded (cached)
          if (video.readyState >= 1) onLoaded();
        });

        console.log("Cloudinary video loaded ✅");

        // ==============================
        // 4. VIDEO TEXTURE
        // ==============================
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.colorSpace = THREE.SRGBColorSpace;
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.generateMipmaps = false;

        // ==============================
        // 5. VIDEO PLANE
        // ==============================
        const geometry = new THREE.PlaneGeometry(1, 0.5625);

        // ==============================
        // 6. VIDEO MATERIAL
        // ==============================
        const material = new THREE.MeshBasicMaterial({
          map: videoTexture,
          side: THREE.DoubleSide,
          toneMapped: false,
        });

        // ==============================
        // 7. VIDEO MESH
        // ==============================
        const videoMesh = new THREE.Mesh(geometry, material);
        videoMeshRef.current = videoMesh;
        videoMesh.visible = false;

        // ==============================
        // 8. MINDAR TARGET 0
        // ==============================
        const anchor = mindarThree.addAnchor(0);

        // ==============================
        // 9. ATTACH VIDEO TO TARGET
        // ==============================
        anchor.group.add(videoMesh);

        // ==============================
        // 10. TARGET FOUND
        // ==============================
        anchor.onTargetFound = async () => {
          if (!mounted) return;
          console.log("TARGET FOUND");

          videoMesh.visible = true;
          setTargetFound(true);

          try {
            await video.play();
            console.log("VIDEO PLAYING:", !video.paused);
          } catch (err) {
            console.log("Autoplay failed:", err);
          }
        };

        // ==============================
        // 11. TARGET LOST
        // ==============================
        anchor.onTargetLost = () => {
          if (!mounted) return;
          console.log("TARGET LOST");

          videoMesh.visible = false;
          setTargetFound(false);
          video.pause();
        };

        // ==============================
        // 12. START AR
        // ==============================
        await mindarThree.start();
        if (!mounted) return;

        setStarted(true);
        console.log("AR STARTED");

        // ==============================
        // 13. RENDER LOOP
        // ==============================
        renderer.setAnimationLoop(() => {
          renderer.render(scene, camera);
        });
      } catch (err) {
        console.error("AR ERROR:", err);
        if (mounted) {
          setError(err?.message || "Unable to start AR");
        }
      }
    };

    startAR();

    // ==============================
    // CLEANUP
    // ==============================
    return () => {
      mounted = false;

      if (mindarThree) {
        try {
          mindarThree.renderer.setAnimationLoop(null);
          mindarThree.stop();
          mindarThree.renderer.dispose();
        } catch (e) {
          console.log("Cleanup:", e);
        }
      }

      if (video) {
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
          if (video.parentNode) {
            video.parentNode.removeChild(video);
          }
        } catch (e) {
          console.log("Video cleanup:", e);
        }
      }

      if (videoMeshRef.current) {
        videoMeshRef.current.geometry.dispose();
        videoMeshRef.current.material.dispose();
      }
    };
  }, []);

  // ==============================
  // ENABLE SOUND
  // ==============================
  const enableSound = async () => {
    if (!videoRef.current) return;
    try {
      videoRef.current.muted = false;
      await videoRef.current.play();
      console.log("Sound enabled");
    } catch (err) {
      console.log("Sound error:", err);
    }
  };

  return (
    <div className="ar-page">
      {/* CAMERA / AR */}
      <div ref={containerRef} className="ar-container" />

      {/* STATUS */}
      <div className="status-box">
        {!started && !error && <span>Starting AR...</span>}
        {started && !targetFound && <span>Point camera at photo frame</span>}
        {targetFound && <span>🎥 Video Playing</span>}
        {error && <span>Error: {error}</span>}
      </div>

      {/* SOUND */}
      {targetFound && (
        <button className="sound-button" onClick={enableSound}>
          🔊 Enable Sound
        </button>
      )}
    </div>
  );
}

export default App;