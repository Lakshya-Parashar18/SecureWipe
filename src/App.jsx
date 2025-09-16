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
  const [backTopVisible, setBackTopVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("top");
  const [introVisible, setIntroVisible] = useState(true);
  const [introFade, setIntroFade] = useState(false);
  const [contactToast, setContactToast] = useState("");
  const videoRef = useRef(null);
  const [videoStarted, setVideoStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRafRef = useRef(0);


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
      const sections = ["why","benefits","how","download","contact"];
      const mid = y + window.innerHeight * 0.35;
      let current = "top";
      for (let id of sections) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= mid) current = id;
      }
      setActiveSection(current);
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
        <a href="#top" className="brand">SecureWipe</a>
        <div className="links">
          <a href="#why" className={activeSection==="why"?"active":""}>Why</a>
          <a href="#benefits" className={activeSection==="benefits"?"active":""}>Benefits</a>
          <a href="#how" className={activeSection==="how"?"active":""}>Guide</a>
          <a href="#contact" className={activeSection==="contact"?"active":""}>Contact</a>
          <a href="#download" className={`cta ${activeSection==="download"?"active":""}`}>Download</a>
        </div>
        <div className="scroll-progress" aria-hidden="true">
          <div className="scroll-progress-bar" style={{ width: `${scrollProgress*100}%` }} />
        </div>
      </nav>
      {/* Hero Section */}
      <header className="hero" data-scroll-section>
        <div className="animated-bg" aria-hidden="true"></div>
        <div className="title-wrap">
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
              viewport={{ once: true }}
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
              viewport={{ once: true }}
              transition={{ delay: index * 0.2, duration: 0.5 }}
            >
              {step}
            </motion.li>
          ))}
        </ol>
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
        <p className="checksum">Version 1.0 | SHA256: abc123xyz...</p>
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
            <div className="brand-mark" aria-hidden="true"></div>
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
              <li><a href="#" onClick={(e)=>e.preventDefault()}>Privacy Policy</a></li>
              <li><a href="#" onClick={(e)=>e.preventDefault()}>Terms of Service</a></li>
              <li><a href="#" onClick={(e)=>e.preventDefault()}>Cookie Policy</a></li>
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
