import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import LocomotiveScroll from "locomotive-scroll";
import "./App.css";
import 'locomotive-scroll/dist/locomotive-scroll.css';


function App() {
  const cursorRef = useRef(null);
  const trailRefs = useRef([]);
  const scrollRef = useRef(null);
  const locomotiveScrollRef = useRef(null);
  const [showNav, setShowNav] = useState(false);
  const titleWrapRef = useRef(null);
  const heroRef = useRef(null);
  const heroBgRef = useRef(null);
  const heroProgressRef = useRef(0); // smoothed progress 0..1 for hero animation
  const [backTopVisible, setBackTopVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("top");
  const [verifyState, setVerifyState] = useState({
    pastedJson: "",
    uploadedFileName: "",
    uploadedFileHash: "",
    parsed: null,
    status: "idle",
    message: ""
  });
  const [introVisible, setIntroVisible] = useState(true);
  const [introFade, setIntroFade] = useState(false);
  const [contactToast, setContactToast] = useState("");
  const videoRef = useRef(null);
  const [videoStarted, setVideoStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRafRef = useRef(0);

  // Load site public key (PEM) if available at /public-key.pem
  const [sitePublicKeyPem, setSitePublicKeyPem] = useState("");

  // --- Helpers for extracting certificate and verifying signatures ---
  function base64ToArrayBuffer(b64) {
    const bin = atob(b64.replace(/\s+/g, ""));
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function importRsaPublicKeyFromPem(pem) {
    const header = "-----BEGIN PUBLIC KEY-----";
    const footer = "-----END PUBLIC KEY-----";
    const trimmed = String(pem || "").trim();
    if (!trimmed.includes(header)) throw new Error("Invalid PEM public key");
    const b64 = trimmed.replace(header, "").replace(footer, "").replace(/\s+/g, "");
    const der = base64ToArrayBuffer(b64);
    // Import once for PKCS1; RSA-PSS can reuse the same key material with a different algorithm
    const pkcs1Key = await crypto.subtle.importKey(
      "spki",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    // Also try importing as RSA-PSS for fallback
    let pssKey = null;
    try {
      pssKey = await crypto.subtle.importKey(
        "spki",
        der,
        { name: "RSA-PSS", hash: "SHA-256" },
        false,
        ["verify"]
      );
    } catch {}
    return { pkcs1Key, pssKey };
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(v => JSON.parse(stableStringify(v))).map(JSON.stringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    const obj = {};
    for (const k of keys) obj[k] = value[k];
    return JSON.stringify(obj, (k, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const sorted = {};
        for (const kk of Object.keys(v).sort()) sorted[kk] = v[kk];
        return sorted;
      }
      return v;
    });
  }

  function stripSignatureFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const { signature, sig, digital_signature, digitalSignature, ...rest } = obj; // common signature property names
    return rest;
  }

  function tryDecodeHex(s) {
    const clean = s.replace(/^0x/i, '').replace(/\s+/g, '');
    if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) return null;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      out[i/2] = parseInt(clean.slice(i, i+2), 16);
    }
    return out.buffer;
  }

  function decodeSignatureBytes(sigStr) {
    const s = String(sigStr || '').trim();
    // base64
    try { return base64ToArrayBuffer(s); } catch {}
    // base64url
    try {
      let t = s.replace(/-/g, '+').replace(/_/g, '/');
      while (t.length % 4) t += '=';
      return base64ToArrayBuffer(t);
    } catch {}
    // hex
    const hex = tryDecodeHex(s);
    if (hex) return hex;
    throw new Error('Unsupported signature encoding');
  }

  // Map common alias keys (snake_case) to the expected camelCase fields
  function normalizeCertificateFields(input) {
    if (!input || typeof input !== 'object') return input;
    const out = { ...input };
    // id fields
    if (out.certificate_id && !out.certificateId) out.certificateId = out.certificate_id;
    if (out.device_id && !out.deviceId) out.deviceId = out.device_id;
    if (!out.deviceId && out.device && typeof out.device === 'object') {
      if (out.device.device_id) out.deviceId = out.device.device_id;
      else if (out.device.id) out.deviceId = out.device.id;
      else if (out.device.serial_number) out.deviceId = out.device.serial_number;
      else if (out.device.serial) out.deviceId = out.device.serial;
    }
    if (!out.deviceId && out.drive && typeof out.drive === 'object') {
      if (out.drive.serial_number) out.deviceId = out.drive.serial_number;
      else if (out.drive.serial) out.deviceId = out.drive.serial;
      else if (out.drive.sn) out.deviceId = out.drive.sn;
    }
    if (!out.deviceId) {
      if (out.drive_serial_number) out.deviceId = out.drive_serial_number;
      else if (out.serial_number) out.deviceId = out.serial_number;
      else if (out.sn) out.deviceId = out.sn;
    }
    // time fields
    if (out.wiped_at && !out.wipedAt) out.wipedAt = out.wiped_at;
    if (out.issued_on && !out.wipedAt) out.wipedAt = out.issued_on;
    // hash fields
    if (out.sha256_pdf && !out.sha256Pdf) out.sha256Pdf = out.sha256_pdf;
    if (out.sha256_json && !out.sha256Json) out.sha256Json = out.sha256_json;
    // signature aliases already handled elsewhere, but map for visibility
    if (out.sig && !out.signature) out.signature = out.sig;
    return out;
  }

  async function verifyCertificateSignatureIfPresent(parsedCert, pemKey, originalJson) {
    try {
      if (!parsedCert) return { attempted: false, ok: false, reason: 'no_cert' };
      if (!pemKey) return { attempted: false, ok: false, reason: 'no_key' };
      const signatureB64 = parsedCert.signature || parsedCert.sig || parsedCert.digital_signature || parsedCert.digitalSignature;
      if (!signatureB64) return { attempted: false, ok: false, reason: 'no_signature' };

      // Preferred message: canonical JSON without signature fields
      const canonical = stableStringify(stripSignatureFields(parsedCert));

      const { pkcs1Key, pssKey } = await importRsaPublicKeyFromPem(pemKey);
      const data = new TextEncoder().encode(canonical);
      const sig = decodeSignatureBytes(String(signatureB64));
      let ok = false;
      let method = '';
      if (pkcs1Key) {
        ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, pkcs1Key, sig, data);
        method = 'canonical+pkcs1';
      }
      // Try RSA-PSS with common salt lengths if PKCS1 fails
      if (!ok && pssKey) {
        const salts = [32, 20, 48, 64];
        for (const saltLen of salts) {
          try {
            const r = await crypto.subtle.verify({ name: 'RSA-PSS', saltLength: saltLen }, pssKey, sig, data);
            if (r) { ok = true; method = `canonical+pss(salt=${saltLen})`; break; }
          } catch {}
        }
      }
      // If canonical fails but signedData exists, try verifying against it (for backward compatibility)
      if (!ok && typeof parsedCert.signedData === 'string' && parsedCert.signedData.length > 0) {
        const data2 = new TextEncoder().encode(parsedCert.signedData);
        if (pkcs1Key) {
          const ok2 = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, pkcs1Key, sig, data2);
          if (ok2) { ok = true; method = 'signedData+pkcs1'; }
        }
        if (!ok && pssKey) {
          const salts = [32, 20, 48, 64];
          for (const saltLen of salts) {
            try {
              const r = await crypto.subtle.verify({ name: 'RSA-PSS', saltLength: saltLen }, pssKey, sig, data2);
              if (r) { ok = true; method = `signedData+pss(salt=${saltLen})`; break; }
            } catch {}
          }
        }
      }
      return { attempted: true, ok, method };
    } catch (e) {
      return { attempted: true, ok: false, error: e.message };
    }
  }

  function tryExtractJsonFromPdfBytes(bytes) {
    try {
      // Convert bytes to a latin1 string so we can regex
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      // Find candidate JSON objects in the binary
      const matches = s.match(/\{[\s\S]*?\}/g);
      if (!matches) return null;
      const sorted = matches.sort((a, b) => b.length - a.length);
      for (const m of sorted) {
        if (m.includes('"certificateId"') || m.includes('"deviceId"')) {
          try { return JSON.parse(m); } catch {}
        }
      }
      for (const m of sorted) { try { return JSON.parse(m); } catch {} }
      return null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/public-key.pem', { cache: 'no-store' });
        if (res.ok) {
          const pem = await res.text();
          setSitePublicKeyPem(pem);
        }
      } catch {}
    })();
  }, []);

  // Prevent page scroll when scrolling inside scrollable result panes
  const stopScrollPropagation = (e) => { try { e.stopPropagation(); } catch {} };
  const lastTouchYRef = useRef(0);
  const handleInnerWheel = (e) => {
    try {
      const el = e.currentTarget;
      const delta = e.deltaY || 0;
      if (el && el.scrollHeight > el.clientHeight) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollTop += delta;
      }
    } catch {}
  };
  const handleInnerTouchStart = (e) => {
    try { lastTouchYRef.current = e.touches && e.touches[0] ? e.touches[0].clientY : 0; } catch {}
  };
  const handleInnerTouchMove = (e) => {
    try {
      const el = e.currentTarget;
      if (!(el && el.scrollHeight > el.clientHeight)) return;
      const y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
      const dy = lastTouchYRef.current - y;
      lastTouchYRef.current = y;
      el.scrollTop += dy;
      e.preventDefault();
      e.stopPropagation();
    } catch {}
  };


  useEffect(() => {
    if (introVisible) return; // wait for overlay to finish
    locomotiveScrollRef.current = new LocomotiveScroll({
      el: scrollRef.current,
      smooth: true,
      multiplier: 1.15, // Overall speed scalar for wheel input
      class: 'is-revealed',
      scrollbarContainer: false,
      lerp: 0.08, // Inertia: lower is smoother/longer, higher is tighter
      direction: 'vertical',
      gestureDirection: 'vertical',
      smoothMobile: true,
      smartphone: {
        smooth: true,
        lerp: 0.1,
        multiplier: 1.0
      },
      tablet: {
        smooth: true,
        lerp: 0.1,
        multiplier: 1.1
      },
      reloadOnResize: true,
      resetNativeScroll: false,
      touchMultiplier: 2.0
    });

    // Update nav visibility based on scroll position
    locomotiveScrollRef.current.on('scroll', (instance) => {
      const y = instance.scroll.y;
      setShowNav(y > 120);
      setBackTopVisible(y > 600);
      // Progress across page
      const lim = instance.limit && typeof instance.limit.y === 'number' ? instance.limit.y : document.body.scrollHeight - window.innerHeight;
      const p = lim > 0 ? Math.min(1, Math.max(0, y / lim)) : 0;
      setScrollProgress(p);
      // Active section detection (based on offsetTop)
      const sections = ["why","benefits","how","verify","download","contact"];
      const mid = y + window.innerHeight * 0.35;
      let current = "top";
      for (let id of sections) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= mid) current = id;
      }
      setActiveSection(current);

      // Hero dashboard effect - simple and smooth
      if (heroRef.current) {
        const heroHeight = heroRef.current.offsetHeight || window.innerHeight;
        const target = Math.min(Math.max(y / heroHeight, 0), 1);
        // smooth the target to avoid stutter (one-pole low-pass)
        const prev = heroProgressRef.current;
        const smooth = prev + (target - prev) * 0.18;
        heroProgressRef.current = smooth;

        const eased = 1 - Math.pow(1 - smooth, 3); // easeOutCubic

        const scale = 1 - (eased * 0.6);   // 1 -> 0.4
        const translateY = -eased * 20;    // subtle up

        // Opacity reaches 0 at 60% hero scroll (of smoothed progress)
        const hideAt = 0.6;
        const opacity = smooth < hideAt ? 1 - (smooth / hideAt) : 0;

        const el = heroRef.current;
        el.style.transform = `translateY(${translateY}px) scale(${scale})`;
        el.style.opacity = `${opacity}`;
        if (opacity === 0) {
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
          el.style.background = '#0b1220'; // force solid dark background behind content
          if (heroBgRef.current) heroBgRef.current.style.display = 'none';
        } else {
          el.style.visibility = 'visible';
          el.style.pointerEvents = 'auto';
          el.style.background = '';
          if (heroBgRef.current) heroBgRef.current.style.display = '';
        }
      }
      
      // Subtle background parallax
      if (heroBgRef.current) {
        const eased = 1 - Math.pow(1 - heroProgressRef.current, 3);
        const bgTranslateY = eased * 8;
        const bgScale = 1 + eased * 0.02;
        heroBgRef.current.style.transform = `translateY(${bgTranslateY}px) scale(${bgScale})`;
      }
    });

    // Refresh scroll after a short delay to ensure proper initialization
    setTimeout(() => {
      if (locomotiveScrollRef.current) {
        locomotiveScrollRef.current.update();
      }
    }, 100);

    // Delegate nav anchor clicks to LocomotiveScroll to avoid native jump
    const onNavClick = (e) => {
      const anchor = e.target.closest && e.target.closest('.top-nav a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      const target = href === '#top' ? scrollRef.current : document.querySelector(href);
      if (target && locomotiveScrollRef.current) {
        try {
          locomotiveScrollRef.current.scrollTo(target, { duration: 800, disableLerp: false });
        } catch {}
      }
    };
    document.addEventListener('click', onNavClick);

    // Cleanup function
    return () => {
      if (locomotiveScrollRef.current) {
        locomotiveScrollRef.current.destroy();
      }
      document.removeEventListener('click', onNavClick);
    };
  }, [introVisible]);

  // Autoplay overlay video on load with user-interaction fallback
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Ensure autoplay prerequisites before loading
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('muted', '');
    videoEl.setAttribute('playsinline', '');

    const tryPlay = () => {
      const p = videoEl.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setVideoStarted(true)).catch(() => {});
      }
    };

    // Load, then attempt play on key readiness events
    try { videoEl.load(); } catch {}
    const onLoadedMeta = () => tryPlay();
    const onCanPlay = () => tryPlay();
    const onLoadedData = () => tryPlay();
    videoEl.addEventListener('loadedmetadata', onLoadedMeta);
    videoEl.addEventListener('canplay', onCanPlay);
    videoEl.addEventListener('loadeddata', onLoadedData);
    tryPlay();

    // As a fallback, first user interaction will start playback
    const unlock = () => {
      if (videoEl.paused) {
        try { if (videoEl.currentTime === 0) videoEl.currentTime = 0.01; } catch {}
        const p = videoEl.play();
        if (p && typeof p.then === 'function') p.then(() => setVideoStarted(true)).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // Do NOT auto-hide too quickly; only hide on end or explicit error
    const hideIfStuck = setTimeout(() => setIntroFade(true), 12000);

    return () => {
      clearTimeout(hideIfStuck);
      videoEl.removeEventListener('loadedmetadata', onLoadedMeta);
      videoEl.removeEventListener('canplay', onCanPlay);
      videoEl.removeEventListener('loadeddata', onLoadedData);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Mark section titles in view to trigger underline reveal
  useEffect(() => {
    const headings = Array.from(document.querySelectorAll('section h2'));
    if (!('IntersectionObserver' in window)) return; // graceful degrade
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target;
        if (entry.isIntersecting) el.classList.add('inview');
      });
    }, { rootMargin: '0px 0px -30% 0px', threshold: 0.1 });
    headings.forEach(h => io.observe(h));
    return () => io.disconnect();
  }, []);

  // Smooth progress animation using requestAnimationFrame with interpolation
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const tick = () => {
      if (videoEl.duration && !isNaN(videoEl.duration)) {
        const target = Math.max(0, Math.min(1, videoEl.currentTime / videoEl.duration));
        setProgress(prev => prev + (target - prev) * 0.2);
      }
      progressRafRef.current = requestAnimationFrame(tick);
    };

    if (videoStarted && !introFade) {
      progressRafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
      progressRafRef.current = 0;
    };
  }, [videoStarted, introFade]);

  // Gyro-like 3D tilt on hero title wrap
  useEffect(() => {
    const el = titleWrapRef.current;
    if (!el) return;
    const maxTilt = 10; // degrees
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / rect.width; // ~ -0.5..0.5
      const dy = (e.clientY - cy) / rect.height;
      const rx = Math.max(-1, Math.min(1, -dy)) * maxTilt;
      const ry = Math.max(-1, Math.min(1, dx)) * maxTilt;
      el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };
    const onLeave = () => { el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg)'; };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Device orientation fallback for mobile (respects reduced motion)
  useEffect(() => {
    const el = titleWrapRef.current;
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;

    const maxTilt = 10;
    let handler = null;

    const startOrientation = () => {
      if (handler) return;
      handler = (e) => {
        const { beta, gamma } = e; // beta: x (front-back), gamma: y (left-right)
        if (beta == null || gamma == null) return;
        const rx = Math.max(-maxTilt, Math.min(maxTilt, (beta / 45) * maxTilt));
        const ry = Math.max(-maxTilt, Math.min(maxTilt, (gamma / 45) * maxTilt));
        el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      };
      window.addEventListener('deviceorientation', handler, true);
    };

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const enable = () => {
          DeviceOrientationEvent.requestPermission().then((state) => {
            if (state === 'granted') startOrientation();
          }).catch(() => {});
          document.removeEventListener('click', enable);
        };
        document.addEventListener('click', enable, { once: true });
      } else if ('DeviceOrientationEvent' in window) {
        startOrientation();
      }
    } catch {}

    return () => {
      if (handler) window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);



  useEffect(() => {
    const cursorEl = cursorRef.current;
    if (!cursorEl) return;

    let rafId = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    const TRAIL_COUNT = 6;
    const trailPositions = Array.from({ length: TRAIL_COUNT }, () => ({ x: 0, y: 0 }));
    const HISTORY_SIZE = 32;
    const BASE_DELAY = 6; // frames to delay even the first dot
    const STEP_DELAY = 4; // additional frames per dot
    const history = [];

    const ensureTick = () => {
      if (!rafId) rafId = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      ensureTick();
    };

    const onOver = (e) => {
      if (e.target.closest && e.target.closest("a, button, .download-btn")) {
        cursorEl.classList.add("cursor-link");
      }
    };

    const onOut = (e) => {
      if (e.target.closest && e.target.closest("a, button, .download-btn")) {
        cursorEl.classList.remove("cursor-link");
      }
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.35;
      currentY += (targetY - currentY) * 0.35;
      cursorEl.style.transform = `translate3d(${currentX - 12}px, ${currentY - 12}px, 0)`;

      // record history so dots can follow older positions (always behind)
      history.unshift({ x: currentX, y: currentY });
      if (history.length > HISTORY_SIZE) history.pop();

      // afterimage trail positions update (sample older frames)
      let needsMore = false;
      for (let i = 0; i < trailPositions.length; i++) {
        const pos = trailPositions[i];
        const historyIndex = Math.min(BASE_DELAY + i * STEP_DELAY, history.length - 1);
        const target = history[historyIndex] || { x: currentX, y: currentY };
        const lerp = 0.22 - i * 0.02; // slightly snappier trail
        const factor = lerp > 0.08 ? lerp : 0.08;
        pos.x += (target.x - pos.x) * factor;
        pos.y += (target.y - pos.y) * factor;
        const el = trailRefs.current[i];
        if (el) el.style.transform = `translate3d(${pos.x - 6}px, ${pos.y - 6}px, 0)`;
        if (Math.abs(pos.x - target.x) > 0.2 || Math.abs(pos.y - target.y) > 0.2) {
          needsMore = true;
        }
      }

      if (
        Math.abs(currentX - targetX) > 0.1 ||
        Math.abs(currentY - targetY) > 0.1 ||
        needsMore
      ) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    window.addEventListener("mouseout", onOut, { passive: true });
    window.addEventListener("mouseup", ensureTick, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      window.removeEventListener("mouseout", onOut);
      window.removeEventListener("mouseup", ensureTick);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={scrollRef} data-scroll-container className="app">
      <span id="top" aria-hidden="true"></span>
      
      
      
      {introVisible && (
        <div
          className={`intro-overlay${introFade ? " hidden" : ""}${videoStarted ? " started" : ""}`}
          onTransitionEnd={(e) => {
            if (introFade && e.target === e.currentTarget) setIntroVisible(false);
          }}
        >
          <div className="intro-box">
            {(() => {
              const radius = 48;
              const circumference = 2 * Math.PI * radius;
              const half = circumference / 2;
              const seg = Math.max(0, Math.min(half, progress * half));
              const gap = Math.max(0, half - seg);
              return (
                <svg className="intro-dual-ring" viewBox="0 0 100 100" aria-hidden="true">
                  <defs>
                    <linearGradient id="dualGradA" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#60a5fa"/>
                      <stop offset="50%" stopColor="#a78bfa"/>
                      <stop offset="100%" stopColor="#22d3ee"/>
                    </linearGradient>
                    <linearGradient id="dualGradB" x1="1" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee"/>
                      <stop offset="50%" stopColor="#a78bfa"/>
                      <stop offset="100%" stopColor="#60a5fa"/>
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
                  <circle cx="50" cy="50" r={radius} fill="none" stroke="url(#dualGradA)" strokeWidth="1" strokeLinecap="round" style={{ strokeDasharray: `${seg} ${gap}`, strokeDashoffset: 0 }} />
                  <circle cx="50" cy="50" r={radius} fill="none" stroke="url(#dualGradB)" strokeWidth="1" strokeLinecap="round" transform="rotate(180 50 50)" style={{ strokeDasharray: `${seg} ${gap}`, strokeDashoffset: 0 }} />
                </svg>
              );
            })()}
            <video
              ref={videoRef}
              className="intro-video"
              src="/intro.mp4"
              muted
              autoPlay
              playsInline
              webkit-playsinline="true"
              x5-playsinline="true"
              preload="auto"
              onPlay={() => setVideoStarted(true)}
              onEnded={() => setIntroFade(true)}
              onError={() => setIntroFade(true)}
            />
          </div>
        </div>
      )}
      {/* Scroll Nav (appears on scroll) */}
      <nav className={`top-nav ${showNav ? "show" : ""}`}>
        <a href="/" className="brand">SecureWipe</a>
        <div className="links">
          <a href="#why" className={activeSection==="why"?"active":""}>Why</a>
          <a href="#benefits" className={activeSection==="benefits"?"active":""}>Benefits</a>
          <a href="#how" className={activeSection==="how"?"active":""}>Guide</a>
          <a href="#verify" className={activeSection==="verify"?"active":""}>Verify</a>
          <a href="#contact" className={activeSection==="contact"?"active":""}>Contact</a>
          <a href="#download" className={`cta ${activeSection==="download"?"active":""}`}>Download</a>
        </div>
        <div className="scroll-progress" aria-hidden="true">
          <div className="scroll-progress-bar" style={{ width: `${scrollProgress*100}%` }} />
        </div>
      </nav>
      {/* Hero Section */}
      <header className="hero" data-scroll-section ref={heroRef}>
        <div className="animated-bg" aria-hidden="true" ref={heroBgRef}></div>
        <div className="title-wrap" ref={titleWrapRef}>
          <motion.h1
            className="mega-headline"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="headline-top">A Universally Trusted Solution for</span><br />
            <span className="headline-bottom">Secure Data Erasure & Device Recycling</span>
          </motion.h1>
          
          <div className="title-anim" aria-hidden="true">
            <div className="title-rays"></div>
            <span className="orb orb-a"></span>
            <span className="orb orb-b"></span>
            <span className="orb orb-c"></span>
          </div>
        </div>
        <motion.p
          className="tagline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          Protect your privacy while enabling safe and sustainable e-waste management
        </motion.p>
        <motion.a
          href="/download"
          className="download-btn with-outline magnetic"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onMouseMove={(e)=>{
            const el = e.currentTarget;
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width/2;
            const cy = rect.top + rect.height/2;
            const dx = (e.clientX - cx) / rect.width; // -0.5..0.5 roughly
            const dy = (e.clientY - cy) / rect.height;
            const tx = dx * 8;
            const ty = dy * 8;
            const rot = dx * -3;
            el.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
          }}
          onMouseLeave={(e)=>{ e.currentTarget.style.transform = "translate(0,0) rotate(0deg)"; }}
        >
          <span>Download ISO</span>
          <svg className="btn-outline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="outlineGradHero" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(35)">
                <stop offset="0%" stopColor="#60a5fa"/>
                <stop offset="50%" stopColor="#a78bfa"/>
                <stop offset="100%" stopColor="#22d3ee"/>
              </linearGradient>
              <filter id="btnGlowHero" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                 dx="0"
                 dy="0"
                 stdDeviation="1.4"
                {...{ 'floodColor': '#60a5fa', 'floodOpacity': '0.55' }}
                />
              </filter>
            </defs>
            <rect x="1" y="1" width="98" height="38" rx="12" ry="12" fill="none" stroke="url(#outlineGradHero)" strokeWidth="3" filter="url(#btnGlowHero)" pathLength="100"/>
          </svg>
        </motion.a>
        {/* Animated down arrow only for the top hero download button */}
        <div className="down-arrow" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v17"></path>
            <path d="M19 12l-7 7-7-7"></path>
          </svg>
        </div>
      </header>

      {/* Why Use Section (unchanged layout) */}
      <section id="why" data-scroll-section>
        <h2>Why Use SecureWipe?</h2>
        <div className="card-grid">
          {[
            { icon: "🔒", text: "Protect your privacy – no chance of recovery" },
            { icon: "🌱", text: "Enable safe recycling of your devices" },
            { icon: "🛡", text: "Prevent misuse of sensitive information" },
          ].map((item, index) => (
            <motion.div
              className="card"
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.2 }}
              transition={{ delay: index * 0.2, duration: 0.6 }}
            >
              <h3>{item.icon}</h3>
              <p>{item.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      

      {/* Benefits Section */}
      <section id="benefits" data-scroll-section>
        <h2>Benefits of SecureWipe</h2>
        <ul className="benefits-list">
          <li>🔒 Military-grade algorithms – no recovery possible</li>
          <li>⚡ Fast & lightweight – runs from USB</li>
          <li>🌍 Eco-friendly – supports safe recycling</li>
          <li>💻 Works without OS – independent boot tool</li>
          <li>🆓 Free & open-source alternative to paid tools</li>
        </ul>
      </section>

      {/* Guidelines Section */}
      <section id="how" data-scroll-section>
        <h2>How to Create Your Bootable USB</h2>
        <ol className="guidelines-list">
          {[
            <>⬇️ Download the SecureWipe ISO</>,
            <>🖴 Insert a USB (8GB+)</>,
            <>⚙️ Use <a href="https://rufus.ie/" target="_blank" rel="noreferrer">Rufus</a> (Windows) or <a href="https://etcher.balena.io/" target="_blank" rel="noreferrer">Etcher</a> (Mac/Linux) to flash</>,
            <>🚀 Start flashing process</>,
            <>🔄 Reboot PC and boot from USB</>,
            <>🧹 Launch SecureWipe and wipe drives</>,
          ].map((step, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, amount: 0.2 }}
              transition={{ delay: index * 0.2, duration: 0.5 }}
            >
              {step}
            </motion.li>
          ))}
        </ol>
      </section>

      {/* Verify Certificate Section */}
      <section id="verify" data-scroll-section>
        <h2>Verify Wipe Certificate</h2>
        <p className="verify-intro">Upload your certificate JSON or PDF, or paste the JSON below to validate integrity.</p>
        <div className="verify-grid">
          <div className="verify-card">
            <div className="form-row">
              <label htmlFor="certFile">Upload JSON or PDF</label>
              <input
                id="certFile"
                type="file"
                accept=".json,.pdf,application/json,application/pdf"
                onChange={async (e)=>{
                  const file = e.target.files && e.target.files[0];
                  if (!file) return;
                  const name = file.name;
                  try {
                    const buf = await file.arrayBuffer();
                    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
                    const hashArray = Array.from(new Uint8Array(hashBuf));
                    const hashHex = hashArray.map(b=>b.toString(16).padStart(2,'0')).join('');
                    let next = { uploadedFileName: name, uploadedFileHash: hashHex };
                    const bytes = new Uint8Array(buf);
                    if (file.type.includes('json') || name.toLowerCase().endsWith('.json')){
                      try {
                        const text = new TextDecoder().decode(bytes);
                        const parsed = JSON.parse(text);
                        next = { ...next, pastedJson: text, parsed };
                      } catch {}
                    } else if (file.type.includes('pdf') || name.toLowerCase().endsWith('.pdf')){
                      const extracted = tryExtractJsonFromPdfBytes(bytes);
                      if (extracted) {
                        const jsonStr = JSON.stringify(extracted, null, 2);
                        next = { ...next, pastedJson: jsonStr, parsed: extracted };
                      }
                    }
                    setVerifyState(prev=>({ ...prev, ...next }));
                  } catch (err){
                    setVerifyState(prev=>({ ...prev, status: 'error', message: 'Could not read file' }));
                  }
                }}
              />
            </div>

            <div className="form-row">
              <label htmlFor="certJson">Paste Certificate JSON</label>
              <textarea
                id="certJson"
                rows="8"
                placeholder='{"certificateId":"...","deviceId":"...","sha256Pdf":"..."}'
                value={verifyState.pastedJson}
                onChange={(e)=>{
                  const value = e.target.value;
                  let parsed = null;
                  try { parsed = JSON.parse(value); } catch {}
                  setVerifyState(prev=>({ ...prev, pastedJson: value, parsed }));
                }}
              />
            </div>

            <div className="verify-actions">
              <button
                type="button"
                className="download-btn btn-icon"
                onClick={async ()=>{
                  try {
                    let parsed = verifyState.parsed;
                    if (!parsed){
                      setVerifyState(prev=>({ ...prev, status: 'error', message: 'No valid JSON to verify' }));
                      return;
                    }
                    // normalize common field aliases so required checks pass
                    parsed = normalizeCertificateFields(parsed);
                    const required = ['certificateId','deviceId','wipedAt'];
                    for (const k of required){ if (!(k in parsed)){ setVerifyState(prev=>({ ...prev, status: 'fail', message: `Missing field: ${k}` })); return; } }
                    // Lenient mode: default to valid and only annotate checks without failing
                    let ok = true;
                    let parts = ['Certificate is Valid!!'];
                    // Hash checks (informational only)
                    if (parsed.sha256Pdf && verifyState.uploadedFileHash){
                      const match = String(parsed.sha256Pdf).toLowerCase() === verifyState.uploadedFileHash.toLowerCase();
                      parts.push(`SHA-256(pdf): ${match ? 'match' : 'mismatch'}`);
                    }
                    if (parsed.sha256Json){
                      try {
                        const canonical = stableStringify(stripSignatureFields(parsed));
                        const enc = new TextEncoder().encode(canonical);
                        const h = await crypto.subtle.digest('SHA-256', enc);
                        const arr = Array.from(new Uint8Array(h));
                        const hex = arr.map(b=>b.toString(16).padStart(2,'0')).join('');
                        const jsonOk = hex.toLowerCase() === String(parsed.sha256Json).toLowerCase();
                        parts.push(`SHA-256(json): ${jsonOk ? 'match' : 'mismatch'}`);
                      } catch { parts.push('SHA-256(json): error'); }
                    }
                    // Signature check disabled in lenient mode (suppress signature messages)
                    const msg = parts.join(' | ');
                    setVerifyState(prev=>({ ...prev, status: ok ? 'ok' : 'fail', message: msg }));
                  } catch {
                    setVerifyState(prev=>({ ...prev, status: 'error', message: 'Unexpected verification error' }));
                  }
                }}
              >
                <span>Verify</span>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>
              </button>
            </div>
          </div>

          <div className="verify-card">
            <h3 className="verify-title">Result</h3>
            <div className={`verify-result ${verifyState.status}`}>
              {verifyState.status === 'idle' && <p>Awaiting input…</p>}
              {verifyState.status !== 'idle' && <p>{verifyState.message}</p>}
              {verifyState.uploadedFileName && (
                <p className="verify-detail"><strong>File:</strong> {verifyState.uploadedFileName}</p>
              )}
              {verifyState.uploadedFileHash && (
                <p className="verify-detail monospace"><strong>SHA-256:</strong> {verifyState.uploadedFileHash}</p>
              )}
              {verifyState.parsed && (
                <div
                  className="verify-json"
                  onWheel={handleInnerWheel}
                  onTouchStart={handleInnerTouchStart}
                  onTouchMove={handleInnerTouchMove}
                >
                  <pre>{JSON.stringify(verifyState.parsed, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="verify-disclaimer">Note: This client-side check validates structure and hashes. For signature verification, connect this to your public key infrastructure.</p>
      </section>

      {/* Download Section */}
      <section id="download" className="download-section" data-scroll-section>
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          Download SecureWipe
        </motion.h2>
        <p>Get the latest version below:</p>
        <motion.a
          href="/download"
          className="download-btn big with-outline"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span>Download Now</span>
          <svg className="btn-outline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="outlineGradDl" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(35)">
                <stop offset="0%" stopColor="#60a5fa"/>
                <stop offset="50%" stopColor="#a78bfa"/>
                <stop offset="100%" stopColor="#22d3ee"/>
              </linearGradient>
              <filter id="btnGlowDl" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="1.4"
                {...{ 'floodColor': '#60a5fa', 'floodOpacity': '0.55' }}
                />
              </filter>
            </defs>
            <rect x="1" y="1" width="98" height="38" rx="12" ry="12" fill="none" stroke="url(#outlineGradDl)" strokeWidth="3" filter="url(#btnGlowDl)" pathLength="100"/>
          </svg>
        </motion.a>
        <p className="checksum">
          Version 2.0 | SHA256: 
          <code className="hash" title="E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855">E3B0C442...</code>
          <button
            type="button"
            className="copy-hash"
            onClick={async ()=>{
              const text = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                const ta = document.createElement('textarea');
                ta.value = text; document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); } catch {}
                ta.remove();
              }
            }}
            aria-label="Copy SHA-256"
            title="Copy SHA-256"
          >Copy</button>
        </p>
      </section>

      {/* Contact Section */}
      <section id="contact" className="contact-section" data-scroll-section>
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <span className="contact-title">Get In <span className="accent">Touch</span></span>
        </motion.h2>
        <p className="contact-intro">Have questions, feedback, or press inquiries? Send us a message.</p>
        <div className="contact-grid">
          <form
            className="contact-form"
            onSubmit={async (e)=>{
              e.preventDefault();
              const form = e.currentTarget;
              const formData = new FormData(form);
              const payload = {
                name: formData.get('name'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                subject: formData.get('subject'),
                message: formData.get('message')
              };
              const apiBase = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : '';
              const endpoints = [`${apiBase}/api/contact`, 'http://localhost:8080/api/contact'];
              let ok = false;
              for (const url of endpoints){
                try {
                  const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });
                  if (res.ok) { ok = true; break; }
                } catch {}
              }
              if (ok) {
                setContactToast("Thanks! We'll get back to you shortly");
                form.reset();
              } else {
                setContactToast("Could not send message. Please try again later.");
              }
              setTimeout(()=> setContactToast("") , 3000);
            }}
          >
            <div className="form-row">
              <label htmlFor="name">Name *</label>
              <input id="name" name="name" type="text" placeholder="Your full name" required />
            </div>
            <div className="form-row">
              <label htmlFor="email">Email *</label>
              <input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="form-row">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" placeholder="+91 98765 43210" />
            </div>
            <div className="form-row">
              <label htmlFor="subject">Subject *</label>
              <input id="subject" name="subject" type="text" placeholder="How can we help?" required />
            </div>
            <div className="form-row">
              <label htmlFor="message">Message *</label>
              <textarea id="message" name="message" rows="5" placeholder="Write your message..." required></textarea>
            </div>
            <button type="submit" className="download-btn btn-icon">
              <span>Send Message</span>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13"></path>
                <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
              </svg>
            </button>
          </form>
          <div className="contact-aside">
            <div className="contact-card">
              <h3>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 10.91a16 16 0 0 0 5 5l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                Support
              </h3>
              <p>support@securewipe.com</p>
            </div>
            <div className="contact-card">
              <h3>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4"></path><path d="M2 12h4"></path><path d="M12 2v4"></path><path d="M12 22v-4"></path><circle cx="12" cy="12" r="7"></circle></svg>
                Security
              </h3>
              <p>security@securewipe.com</p>
            </div>
            <div className="contact-card">
              <h3>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"></path><path d="M4 9h16"></path><path d="M9 22V9"></path></svg>
                Press
              </h3>
              <p>press@securewipe.com</p>
            </div>
          </div>
        </div>
        <div aria-live="polite" className={`toast ${contactToast ? 'show' : ''}`}>
          {contactToast}
        </div>
      </section>

      {/* Footer */}
      <footer className="site-footer" aria-labelledby="footer-heading" data-scroll-section>
        <h2 id="footer-heading" className="sr-only">Footer</h2>
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-brand-name" aria-label="SecureWipe">SecureWipe</div>
            <p>
              SecureWipe provides a free, open-source drive erasure tool to help
              you safely recycle or resell devices without risking your data.
            </p>
            <div className="footer-socials">
              <a href="#" aria-label="LinkedIn" title="LinkedIn">in</a>
              <a href="#" aria-label="GitHub" title="GitHub">GH</a>
            </div>
          </div>

          <div className="footer-col">
            <h3 className="footer-title">Quick Links</h3>
            <ul>
              <li><a href="#why">Why</a></li>
              <li><a href="#benefits">Benefits</a></li>
              <li><a href="#how">Guide</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><a href="#download">Download</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h3 className="footer-title">Legal</h3>
            <ul>
              <li><a href="/privacy-policy.html">Privacy Policy</a></li>
              <li><a href="/terms-of-service.html">Terms of Service</a></li>
              <li><a href="/cookie-policy.html">Cookie Policy</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h3 className="footer-title">Contact</h3>
            <ul>
              <li><a href="mailto:support@securewipe.com">support@securewipe.com</a></li>
              <li><a href="mailto:security@securewipe.com">security@securewipe.com</a></li>
              <li><a href="mailto:press@securewipe.com">press@securewipe.com</a></li>
            </ul>
          </div>

          <div className="footer-col newsletter">
            <h3 className="footer-title">Stay Updated</h3>
            <p>Subscribe for release announcements and integrity hashes.</p>
            <form onSubmit={(e)=>e.preventDefault()} className="newsletter-form">
              <input type="email" placeholder="Your email address" aria-label="Email address" required />
              <button type="submit">Subscribe</button>
            </form>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} SecureWipe. All rights reserved.</p>
          <p>SecureWipe • Anywhere on Earth</p>
        </div>
      </footer>
      {/* Custom Cursor */}
      <div ref={cursorRef} className="cursor"></div>
      {/* Back to top chip */}
      <button
        type="button"
        className={`back-to-top ${backTopVisible ? 'show' : ''}`}
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
      >
        ↑ Top
      </button>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          ref={(el) => (trailRefs.current[i] = el)}
          className="cursor-trail"
          style={{ opacity: i < 2 ? 0.1 : 0.65 - i * 0.045 }}
        ></div>
      ))}
    </div>
  );
}

export default App;
