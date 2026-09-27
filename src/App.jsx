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
  const [needsTap, setNeedsTap] = useState(false);

  // ============================================================
  // MOBILE DETECTION
  // ============================================================
  const isMobile = /iPhone|iPad|iPod|Android/i.test(
    navigator.userAgent
  );

  // ============================================================
  // iOS SAFARI REQUIRES USER GESTURE FOR CAMERA
  // ============================================================
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isSafari =
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  useEffect(() => {
    // On iOS Safari, we must wait for a user tap
    if (isIOS || isSafari) {
      setNeedsTap(true);
    }
  }, [isIOS, isSafari]);

  // ============================================================
  // AR SETUP FUNCTION
  // ============================================================
  const startAR = async () => {
    let mindarThree = null;
    let video = null;
    let mounted = true;

    try {
      if (!containerRef.current) return;

      // ==============================
      // 1. CREATE MINDAR
      // ==============================
      mindarThree = new MindARThree({
        container: containerRef.current,
        imageTargetSrc: "/gift/targets.mind", // 👈 base path fix

        facingMode: "environment",

        // Tracking tuning for mobile stability
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

      // 👇 Cap pixel ratio for mobile performance
      const maxDPR = isMobile ? 1.5 : 2;
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, maxDPR)
      );

      renderer.setSize(
        window.innerWidth,
        window.innerHeight
      );

      // ==============================
      // 3. CREATE VIDEO (Cloudinary)
      // ==============================
      video = document.createElement("video");
      video.src = VIDEO_URL;

      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";

      // 👇 iOS-critical attributes
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.setAttribute("muted", "");

      video.preload = "auto";

      video.style.display = "none";
      document.body.appendChild(video);

      videoRef.current = video;

      // ==============================
      // 3a. WAIT FOR METADATA
      // ==============================
      await new Promise((resolve, reject) => {
        const onLoaded = () => {
          video.removeEventListener(
            "loadedmetadata",
            onLoaded
          );
          video.removeEventListener("error", onError);
          resolve();
        };

        const onError = () => {
          video.removeEventListener(
            "loadedmetadata",
            onLoaded
          );
          video.removeEventListener("error", onError);
          reject(
            new Error("Failed to load Cloudinary video.")
          );
        };

        video.addEventListener(
          "loadedmetadata",
          onLoaded
        );
        video.addEventListener("error", onError);

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
      // Keep 16:9 aspect ratio
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
      const videoMesh = new THREE.Mesh(
        geometry,
        material
      );
      videoMeshRef.current = videoMesh;
      videoMesh.visible = false;

      // ==============================
      // 8. MINDAR TARGET 0
      // ==============================
      const anchor = mindarThree.addAnchor(0);

      // ==============================
      // 9. ATTACH VIDEO
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

      // ==============================
      // 14. RESIZE HANDLER (mobile rotation)
      // ==============================
      const handleResize = () => {
        if (!renderer || !camera) return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        renderer.setSize(w, h);

        if (camera.isPerspectiveCamera) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      };

      window.addEventListener(
        "resize",
        handleResize
      );
      window.addEventListener(
        "orientationchange",
        handleResize
      );

      // Save for cleanup
      mindarThree._handleResize = handleResize;
    } catch (err) {
      console.error("AR ERROR:", err);
      setError(err?.message || "Unable to start AR");
    }

    // ==============================
    // CLEANUP
    // ==============================
    return () => {
      mounted = false;

      if (mindarThree) {
        try {
          if (mindarThree._handleResize) {
            window.removeEventListener(
              "resize",
              mindarThree._handleResize
            );
            window.removeEventListener(
              "orientationchange",
              mindarThree._handleResize
            );
          }

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
  };

  // ============================================================
  // AUTO START (NON-IOS) or WAIT FOR TAP (iOS)
  // ============================================================
  useEffect(() => {
    if (needsTap) return;

    let cleanup;
    (async () => {
      cleanup = await startAR();
    })();

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsTap]);

  // ============================================================
  // MANUAL START (iOS — user gesture)
  // ============================================================
  const handleStartTap = async () => {
    setNeedsTap(false);
    // Trigger a tiny delay so state update fires first
    setTimeout(async () => {
      await startAR();
    }, 50);
  };

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

  // ==============================
  // UI
  // ==============================
  return (
    <div className="ar-page">
      {/* CAMERA / AR */}
      <div ref={containerRef} className="ar-container" />

      {/* iOS TAP-TO-START SCREEN */}
      {needsTap && (
        <div className="tap-overlay">
          <div className="tap-card">
            <div className="tap-icon">📸</div>
            <h1>Father AR Experience</h1>
            <p>
              Tap below to start the camera and
              see the video come alive on the
              photo frame.
            </p>
            <button
              className="tap-button"
              onClick={handleStartTap}
            >
              ▶ Start AR
            </button>
          </div>
        </div>
      )}

      {/* STATUS */}
      {!needsTap && (
        <div className="status-box">
          {!started && !error && (
            <span>Starting AR...</span>
          )}
          {started && !targetFound && (
            <span>
              📷 Point camera at photo frame
            </span>
          )}
          {targetFound && (
            <span>🎥 Video Playing</span>
          )}
          {error && (
            <span>⚠️ {error}</span>
          )}
        </div>
      )}

      {/* SOUND */}
      {targetFound && (
        <button
          className="sound-button"
          onClick={enableSound}
        >
          🔊 Enable Sound
        </button>
      )}
    </div>
  );
}

export default App;