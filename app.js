(() => {
  const canvas = document.getElementById("ocean");
  const ctx = canvas.getContext("2d", { alpha: true });
  const depthValue = document.getElementById("depthValue");
  const depthFill = document.getElementById("depthFill");
  const scrollWhale = document.getElementById("scrollWhale");
  const root = document.documentElement;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MAX_DEPTH = 10000;

  // yaw: 0 left profile → 90 front → 180 right profile (multi-angle blend)
  const whalePath = [
    { p: 0.0, x: 38, y: 18, s: 0.9, yaw: 0, o: 1 },
    { p: 0.1, x: 42, y: 21, s: 0.94, yaw: 0, o: 0.98 },
    { p: 0.16, x: 38, y: 24, s: 0.92, yaw: 30, o: 0.97 },
    { p: 0.22, x: 28, y: 27, s: 0.9, yaw: 55, o: 0.96 },
    { p: 0.28, x: 16, y: 30, s: 0.88, yaw: 90, o: 0.96 },
    { p: 0.34, x: 8, y: 32, s: 0.86, yaw: 135, o: 0.95 },
    { p: 0.4, x: 4, y: 34, s: 0.84, yaw: 180, o: 0.94 },
    { p: 0.48, x: 14, y: 36, s: 0.82, yaw: 180, o: 0.93 },
    { p: 0.54, x: 26, y: 37, s: 0.8, yaw: 140, o: 0.92 },
    { p: 0.6, x: 38, y: 38, s: 0.78, yaw: 90, o: 0.91 },
    { p: 0.66, x: 44, y: 40, s: 0.76, yaw: 40, o: 0.9 },
    { p: 0.72, x: 42, y: 42, s: 0.72, yaw: 0, o: 0.88 },
    { p: 0.8, x: 24, y: 45, s: 0.66, yaw: 70, o: 0.82 },
    { p: 0.88, x: 10, y: 50, s: 0.58, yaw: 130, o: 0.72 },
    { p: 1.0, x: 18, y: 56, s: 0.46, yaw: 180, o: 0.42 },
  ];

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function sampleWhalePath(progress) {
    const p = Math.min(1, Math.max(0, progress));
    let i = 0;
    while (i < whalePath.length - 1 && whalePath[i + 1].p < p) i += 1;
    const a = whalePath[i];
    const b = whalePath[Math.min(i + 1, whalePath.length - 1)];
    const span = Math.max(0.0001, b.p - a.p);
    const ease = easeInOutCubic((p - a.p) / span);
    return {
      x: lerp(a.x, b.x, ease),
      y: lerp(a.y, b.y, ease),
      s: lerp(a.s, b.s, ease),
      yaw: lerp(a.yaw, b.yaw, ease),
      o: lerp(a.o, b.o, ease),
    };
  }

  const whaleCard = document.getElementById("whaleCard");
  let whalePose = { ...whalePath[0] };
  let whaleSmooth = 0;
  let whaleBank = 0;

  function updateScrollWhale(progress, dt) {
    if (!scrollWhale || !whaleCard) return;
    const target = reducedMotion ? whalePath[0] : sampleWhalePath(progress);
    const follow = reducedMotion ? 1 : Math.min(1, 0.04 + dt * 2.1);

    whalePose.x = lerp(whalePose.x, target.x, follow);
    whalePose.y = lerp(whalePose.y, target.y, follow);
    whalePose.s = lerp(whalePose.s, target.s, follow);
    whalePose.yaw = lerp(whalePose.yaw, target.yaw, follow);
    whalePose.o = lerp(whalePose.o, target.o, follow);

    const mobile = window.innerWidth < 820;
    const s = mobile ? whalePose.s * 0.72 : whalePose.s;
    const whaleW = scrollWhale.offsetWidth || Math.min(window.innerWidth * 0.48, 520);
    const whaleH = whaleW * 0.56;
    let xPct = mobile ? Math.min(whalePose.x, 26) : whalePose.x;
    let yPct = mobile ? whalePose.y * 0.8 + 8 : whalePose.y;
    let x = (xPct / 100) * window.innerWidth;
    let y = (yPct / 100) * window.innerHeight;
    x = Math.max(8, Math.min(x, window.innerWidth - whaleW - 8));
    // Keep vertical travel inside the viewport band — no bobbing out of frame
    const yMin = Math.max(72, window.innerHeight * 0.12);
    const yMax = Math.min(window.innerHeight - whaleH - 24, window.innerHeight * 0.62);
    y = Math.max(yMin, Math.min(y, yMax));

    // Single PNG only — soft bank from path motion, no angle-frame swaps
    const targetBank = Math.sin((whalePose.yaw * Math.PI) / 180) * -4;
    const bankFollow = reducedMotion ? 1 : Math.min(1, 0.06 + dt * 2.2);
    whaleBank = lerp(whaleBank, targetBank, bankFollow);
    const turning = Math.abs(target.yaw - whalePose.yaw) > 6;

    scrollWhale.style.transform =
      `translate3d(${x}px, ${y}px, 0) scale(${s}) rotate(${whaleBank.toFixed(2)}deg)`;
    scrollWhale.style.opacity = String(whalePose.o);
    whaleCard.style.transform = "";
    scrollWhale.classList.toggle("is-turning", turning);
    scrollWhale.classList.add("is-ready");
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  let scrollProgress = 0;
  let smoothProgress = 0;
  let time = 0;
  let lastTs = 0;
  let raf = 0;

  const bubbles = [];
  const motes = [];
  const rays = [];
  const caustics = [];
  const wavePoints = 48;

  function formatDepth(n) {
    const v = Math.max(0, Math.min(MAX_DEPTH, Math.round(n)));
    if (v >= MAX_DEPTH) return "10k";
    if (v < 1000) return String(v);
    const k = v / 1000;
    const rounded = Math.round(k * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    bubbles.length = 0;
    motes.length = 0;
    rays.length = 0;
    caustics.length = 0;

    const bubbleCount = Math.floor(width / 14);
    for (let i = 0; i < bubbleCount; i++) {
      bubbles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.8 + Math.random() * 5.5,
        speed: 0.2 + Math.random() * 1.1,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.01 + Math.random() * 0.025,
        wobbleAmp: 0.4 + Math.random() * 1.2,
        alpha: 0.1 + Math.random() * 0.4,
        drift: (Math.random() - 0.5) * 0.15,
      });
    }

    const moteCount = Math.floor(width / 8);
    for (let i = 0; i < moteCount; i++) {
      motes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.35 + Math.random() * 1.8,
        vx: -0.12 + Math.random() * 0.24,
        vy: 0.04 + Math.random() * 0.28,
        alpha: 0.06 + Math.random() * 0.2,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    for (let i = 0; i < 9; i++) {
      rays.push({
        x: (width * (i + 0.35)) / 9 + (Math.random() - 0.5) * 60,
        width: 28 + Math.random() * 110,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.0015 + Math.random() * 0.0035,
        alpha: 0.035 + Math.random() * 0.055,
        lean: 0.15 + Math.random() * 0.35,
      });
    }

    for (let i = 0; i < 16; i++) {
      caustics.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.55,
        rx: 30 + Math.random() * 90,
        ry: 8 + Math.random() * 22,
        speed: 0.15 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.03 + Math.random() * 0.06,
      });
    }
  }

  function updateScroll() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const raw = window.scrollY / maxScroll;
    scrollProgress = window.scrollY >= maxScroll - 2 ? 1 : Math.min(1, Math.max(0, raw));
  }

  function drawOceanWash(p) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    const surface = 1 - Math.min(1, p * 1.15);

    g.addColorStop(0, `rgba(120, 200, 210, ${0.08 * surface})`);
    g.addColorStop(0.18, `rgba(30, 120, 150, ${0.1 + p * 0.08})`);
    g.addColorStop(0.45, `rgba(8, 55, 95, ${0.14 + p * 0.22})`);
    g.addColorStop(0.72, `rgba(2, 22, 48, ${0.2 + p * 0.35})`);
    g.addColorStop(1, `rgba(0, 4, 14, ${0.28 + p * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  function drawSurfaceWaves(p) {
    if (p > 0.42) return;
    const strength = 1 - p / 0.42;
    const amp = 10 + 6 * strength;
    const baseY = height * 0.02;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, baseY + 40);

    for (let i = wavePoints; i >= 0; i--) {
      const x = (i / wavePoints) * width;
      const y =
        baseY +
        Math.sin(time * 1.1 + i * 0.35) * amp +
        Math.sin(time * 0.55 + i * 0.18) * amp * 0.55 +
        Math.sin(time * 2.1 + i * 0.7) * amp * 0.22;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const foam = ctx.createLinearGradient(0, 0, 0, baseY + 50);
    foam.addColorStop(0, `rgba(230, 250, 255, ${0.22 * strength})`);
    foam.addColorStop(0.45, `rgba(160, 220, 235, ${0.1 * strength})`);
    foam.addColorStop(1, "rgba(80, 160, 190, 0)");
    ctx.fillStyle = foam;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= wavePoints; i++) {
      const x = (i / wavePoints) * width;
      const y =
        baseY +
        8 +
        Math.sin(time * 1.1 + i * 0.35 + 0.4) * amp * 0.7 +
        Math.sin(time * 0.7 + i * 0.22) * amp * 0.4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * strength})`;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();
  }

  function drawRays(p) {
    const strength = Math.max(0, 1 - p * 1.45);
    if (strength <= 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ray of rays) {
      ray.sway += ray.swaySpeed;
      const sway = Math.sin(ray.sway) * 36;
      const x = ray.x + sway;
      const topY = -60;
      const bottomY = height * (0.5 + (1 - p) * 0.35);
      const lean = ray.lean * width * 0.04;

      const grad = ctx.createLinearGradient(x, topY, x + lean, bottomY);
      grad.addColorStop(0, `rgba(210, 245, 255, ${ray.alpha * strength * 1.8})`);
      grad.addColorStop(0.25, `rgba(120, 200, 230, ${ray.alpha * strength * 0.85})`);
      grad.addColorStop(0.65, `rgba(40, 130, 180, ${ray.alpha * strength * 0.25})`);
      grad.addColorStop(1, "rgba(10, 60, 100, 0)");

      ctx.beginPath();
      ctx.moveTo(x - ray.width * 0.12, topY);
      ctx.lineTo(x + ray.width * 0.12, topY);
      ctx.lineTo(x + ray.width * 0.7 + lean, bottomY);
      ctx.lineTo(x - ray.width * 0.7 + lean, bottomY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCaustics(p) {
    const strength = Math.max(0, 1 - p * 1.6);
    if (strength <= 0.02) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const c of caustics) {
      c.phase += 0.008;
      c.x += Math.sin(c.phase) * c.speed * 0.35;
      c.y += Math.cos(c.phase * 0.7) * c.speed * 0.2;
      if (c.x < -100) c.x = width + 80;
      if (c.x > width + 100) c.x = -80;
      if (c.y < -40) c.y = height * 0.5;
      if (c.y > height * 0.6) c.y = -20;

      const pulse = 0.65 + Math.sin(c.phase * 1.4) * 0.35;
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.rx);
      grad.addColorStop(0, `rgba(200, 240, 255, ${c.alpha * strength * pulse})`);
      grad.addColorStop(0.45, `rgba(100, 190, 220, ${c.alpha * strength * 0.35})`);
      grad.addColorStop(1, "rgba(40, 120, 160, 0)");

      ctx.beginPath();
      ctx.ellipse(
        c.x,
        c.y,
        c.rx * (0.85 + Math.sin(c.phase) * 0.15),
        c.ry * (0.85 + Math.cos(c.phase * 1.2) * 0.2),
        Math.sin(c.phase * 0.5) * 0.5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBubbles(p) {
    const nearSurfaceBoost = Math.max(0.45, 1 - p * 0.35);
    for (const b of bubbles) {
      b.wobble += b.wobbleSpeed;
      b.y -= b.speed * (0.55 + nearSurfaceBoost * 0.55);
      b.x += Math.sin(b.wobble) * b.wobbleAmp + b.drift;

      if (b.y < -24) {
        b.y = height + 16 + Math.random() * 50;
        b.x = Math.random() * width;
      }
      if (b.x < -20) b.x = width + 10;
      if (b.x > width + 20) b.x = -10;

      const depthFade = 0.45 + p * 0.55;
      const alpha = b.alpha * depthFade * (0.5 + nearSurfaceBoost * 0.5);

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 235, 245, ${alpha * 0.9})`;
      ctx.lineWidth = Math.max(0.6, b.r * 0.12);
      ctx.stroke();

      const hl = ctx.createRadialGradient(
        b.x - b.r * 0.35,
        b.y - b.r * 0.4,
        0,
        b.x,
        b.y,
        b.r
      );
      hl.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.7})`);
      hl.addColorStop(0.35, `rgba(200, 235, 250, ${alpha * 0.15})`);
      hl.addColorStop(1, "rgba(120, 180, 200, 0)");
      ctx.fillStyle = hl;
      ctx.fill();
    }
  }

  function drawMotes(p) {
    if (p < 0.08) return;
    const visibility = Math.min(1, (p - 0.08) / 0.3);
    for (const m of motes) {
      m.pulse += 0.02;
      m.x += m.vx + Math.sin(m.pulse) * 0.08;
      m.y += m.vy * (0.55 + p * 0.9);
      if (m.y > height + 12) {
        m.y = -12;
        m.x = Math.random() * width;
      }
      if (m.x < -12) m.x = width + 12;
      if (m.x > width + 12) m.x = -12;

      const a = m.alpha * visibility * (0.7 + Math.sin(m.pulse) * 0.3);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(170, 205, 220, ${a})`;
      ctx.fill();
    }
  }

  function drawDepthFog(p) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, `rgba(4, 50, 70, ${0.02 + p * 0.14})`);
    grad.addColorStop(0.35, `rgba(2, 30, 55, ${0.05 + p * 0.28})`);
    grad.addColorStop(0.7, `rgba(1, 12, 28, ${0.12 + p * 0.42})`);
    grad.addColorStop(1, `rgba(0, 2, 10, ${0.22 + p * 0.58})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const haze = ctx.createRadialGradient(
      width * 0.5,
      height * 0.15,
      height * 0.05,
      width * 0.5,
      height * 0.4,
      height * 0.85
    );
    haze.addColorStop(0, `rgba(90, 170, 200, ${(1 - p) * 0.07})`);
    haze.addColorStop(0.5, `rgba(20, 70, 110, ${0.04 + p * 0.08})`);
    haze.addColorStop(1, `rgba(0, 8, 20, ${0.1 + p * 0.25})`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
  }

  function frame(ts) {
    time = ts * 0.001;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    whaleSmooth += (scrollProgress - whaleSmooth) * (reducedMotion ? 1 : 0.028);
    smoothProgress += (scrollProgress - smoothProgress) * (reducedMotion ? 1 : 0.08);
    root.style.setProperty("--depth", smoothProgress.toFixed(4));

    const shownDepth = scrollProgress >= 1 ? 1 : smoothProgress;
    depthValue.textContent = formatDepth(shownDepth * MAX_DEPTH);
    depthFill.style.height = `${shownDepth * 100}%`;
    updateScrollWhale(scrollProgress >= 1 ? 1 : whaleSmooth, dt);

    ctx.clearRect(0, 0, width, height);
    drawOceanWash(smoothProgress);
    drawRays(smoothProgress);
    drawCaustics(smoothProgress);
    drawSurfaceWaves(smoothProgress);
    if (!reducedMotion) {
      drawMotes(smoothProgress);
      drawBubbles(smoothProgress);
    }
    drawDepthFog(smoothProgress);

    raf = requestAnimationFrame(frame);
  }

  function observeReveals() {
    const nodes = document.querySelectorAll(
      ".feature-inner, .discovery-copy, .eco-head, .eco-grid, .calls-schema, .whale-terminal"
    );
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.22, rootMargin: "0px 0px -8% 0px" }
    );
    nodes.forEach((n) => io.observe(n));
  }

  resize();
  seed();
  updateScroll();
  observeReveals();

  window.addEventListener("resize", () => {
    resize();
    seed();
  });
  window.addEventListener("scroll", updateScroll, { passive: true });

  raf = requestAnimationFrame(frame);
  window.addEventListener("beforeunload", () => cancelAnimationFrame(raf));
})();

(() => {
  const btn = document.getElementById("navCa");
  const addrEl = document.getElementById("navCaAddr");
  const actionEl = document.getElementById("navCaAction");
  if (!btn || !addrEl) return;

  function shortCa(ca) {
    if (!ca || ca.length < 10) return ca || "Soon";
    return `${ca.slice(0, 4)}…${ca.slice(-4)}`;
  }

  function syncCaDisplay() {
    const ca = (btn.dataset.ca || "").trim();
    addrEl.textContent = ca ? shortCa(ca) : "Soon";
    btn.classList.toggle("is-empty", !ca);
    btn.title = ca ? "Copy contract address" : "Contract address coming soon";
    btn.setAttribute("aria-label", ca ? `Copy CA ${ca}` : "Contract address coming soon");
  }

  async function copyCa() {
    const ca = (btn.dataset.ca || "").trim();
    if (!ca) {
      actionEl.textContent = "soon";
      btn.classList.add("is-copied");
      setTimeout(() => {
        actionEl.textContent = "copy";
        btn.classList.remove("is-copied");
      }, 1200);
      return;
    }

    try {
      await navigator.clipboard.writeText(ca);
    } catch {
      const range = document.createElement("textarea");
      range.value = ca;
      range.setAttribute("readonly", "");
      range.style.position = "fixed";
      range.style.opacity = "0";
      document.body.appendChild(range);
      range.select();
      document.execCommand("copy");
      document.body.removeChild(range);
    }

    actionEl.textContent = "copied";
    btn.classList.add("is-copied");
    setTimeout(() => {
      actionEl.textContent = "copy";
      btn.classList.remove("is-copied");
    }, 1400);
  }

  syncCaDisplay();
  btn.addEventListener("click", copyCa);
})();

(() => {
  const terminal = document.getElementById("whaleTerminal");
  if (!terminal) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const walletsEl = document.getElementById("wtWallets");
  const streamEl = document.getElementById("wtStream");
  const pingEl = document.getElementById("wtPing");

  const TAGS = ["SMART", "VC", "SNIPER", "MM", "OG", "BOT"];
  const STATES = [
    { id: "accum", label: "ACCUM", cls: "accum" },
    { id: "exit", label: "EXIT", cls: "exit" },
    { id: "rotate", label: "ROTATE", cls: "rotate" },
    { id: "idle", label: "IDLE", cls: "idle" },
  ];

  const wallets = [];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function hexChunk(n = 4) {
    const chars = "0123456789abcdef";
    let s = "";
    for (let i = 0; i < n; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function fakeAddr() {
    const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let s = "";
    for (let i = 0; i < 44; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function shortAddr(a) {
    return `${a.slice(0, 4)}…${a.slice(-4)}`;
  }

  function formatSol(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k SOL`;
    return `${n.toFixed(1)} SOL`;
  }

  function seedWallets() {
    wallets.length = 0;
    for (let i = 0; i < 7; i += 1) {
      const state = pick(STATES);
      const size = rand(52, 980);
      const flow = state.id === "exit" ? -rand(4, 120) : state.id === "idle" ? rand(-8, 12) : rand(8, 160);
      wallets.push({
        id: `w${i}`,
        addr: fakeAddr(),
        tag: pick(TAGS),
        flow,
        size,
        state,
      });
    }
  }

  function renderWallets(flashId) {
    walletsEl.innerHTML = wallets
      .map((w) => {
        const flowCls = w.flow >= 0 ? "up" : "down";
        const flowTxt = `${w.flow >= 0 ? "+" : ""}${w.flow.toFixed(1)}`;
        const flash = w.id === flashId ? " is-flash" : "";
        const exit = w.state.id === "exit" ? " is-exit" : "";
        return `<div class="wt-wallet${flash}${exit}" role="listitem" data-id="${w.id}">
          <span class="addr">${shortAddr(w.addr)}</span>
          <span class="tag">${w.tag}</span>
          <span class="flow ${flowCls}">${flowTxt}</span>
          <span class="size">${formatSol(w.size)}</span>
          <span class="wt-state ${w.state.cls}">${w.state.label}</span>
        </div>`;
      })
      .join("");
  }

  function pushPacket(kind, msg) {
    const li = document.createElement("li");
    li.className = kind;
    li.innerHTML = `<span class="hex">0x${hexChunk(4)}</span><span class="msg">${msg}</span><span class="ago">now</span>`;
    streamEl.prepend(li);
    while (streamEl.children.length > 7) streamEl.removeChild(streamEl.lastChild);
  }

  function seedStream() {
    streamEl.innerHTML = "";
    wallets.slice(0, 5).forEach((w) => {
      const buy = w.flow >= 0;
      pushPacket(
        buy ? "buy" : "sell",
        `${buy ? "INBOUND" : "OUTBOUND"} ${shortAddr(w.addr)} :: ${formatSol(Math.abs(w.flow))} :: ${w.tag}`
      );
    });
  }

  function tickWallets() {
    const w = pick(wallets);
    const next = pick(STATES);
    w.state = next;
    if (next.id === "exit") w.flow = -rand(6, 140);
    else if (next.id === "accum") w.flow = rand(10, 180);
    else if (next.id === "rotate") w.flow = rand(-40, 40);
    else w.flow = rand(-6, 10);
    w.size = Math.max(40, w.size + w.flow * 0.15);
    if (Math.random() > 0.55) w.tag = pick(TAGS);

    renderWallets(w.id);
    pushPacket(
      w.flow >= 0 ? "buy" : "sell",
      `TRACE ${shortAddr(w.addr)} :: ${next.label} :: Δ ${w.flow >= 0 ? "+" : ""}${w.flow.toFixed(1)} SOL`
    );
  }

  function tickPing() {
    pingEl.textContent = `${Math.floor(rand(8, 28))}ms`;
  }

  seedWallets();
  renderWallets();
  seedStream();
  tickPing();

  if (!reducedMotion) {
    const intervals = [
      setInterval(tickWallets, 1800),
      setInterval(tickPing, 2400),
    ];
    window.addEventListener("beforeunload", () => intervals.forEach(clearInterval));
  }
})();
