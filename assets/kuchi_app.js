/* ==========================================================================
   RACM 303 (2569) — Kuchi Gang 2569 Apple TV Overview & Zoom-In Question App
   - Opens directly on 24-Tile Overview Board (22 Members + Trip Topic + QR)
   - Apple TV (tvOS) Origin-Anchored Zoom-In -> Big Question + Live Word Cloud
   - Compatible & Optimal Font Size for Mobile V/H, Duo/Fold, Tablet V/H, PC 16:9
   - Real-Time Sync: MQTT over WSS + PeerJS WebRTC + BroadcastChannel + Storage
   ========================================================================== */
(function () {
  "use strict";

  const DATA = window.KUCHI_DATA || { meta: {}, members: [], sessions: [], roadmap: [], objectives5: [] };
  const MEMBERS = DATA.members || [];
  const MEMBER_MAP = new Map(MEMBERS.map((m) => [m.uid, m]));

  const TOPIC_TRIP_ID = "topic_kuchinarai_expect";
  const TOPIC_ROOT = "racm303/2569/kuchi_gang/v1";
  const BC_NAME = "racm303_2569_kuchi_gang_bc_v1";
  const BROKERS = [
    "wss://mqtt.eclipseprojects.io:443/mqtt",
    "wss://broker.emqx.io:8084/mqtt"
  ];

  const MENTI_COLORS = [
    "#2563eb", // Royal Blue
    "#e11d48", // Coral Rose
    "#7c3aed", // Violet
    "#059669", // Emerald
    "#0284c7", // Sky Blue
    "#db2777"  // Vibrant Pink
  ];

  const QUICK_EMOJIS = ["🙏", "🔥", "💅", "🦕", "🤖", "💯", "🥰", "😎", "🩺", "🎸", "🍜", "😴", "🧗‍♀️", "✌️"];

  /* Ordered list of zoomable targets (22 members + 1 trip expectations topic) */
  const TARGET_LIST = MEMBERS.map((m) => ({
    id: m.uid,
    isTopic: false,
    member: m,
    shortTitle: m.mentiName
  })).concat([
    {
      id: TOPIC_TRIP_ID,
      isTopic: true,
      member: null,
      shortTitle: "ทริปรถไฟ & รพร.กุฉินารายณ์"
    }
  ]);
  const TARGET_MAP = new Map(TARGET_LIST.map((t) => [t.id, t]));

  /* ---------- 1. Helpers & Safe Storage ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function randId(prefix) {
    return `${prefix || "k"}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
  }

  function sGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function sSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (_) {}
  }

  function getJoinUrl() {
    if (typeof window !== "undefined" && /^https?:/i.test(window.location.protocol)) {
      const clean = window.location.href.split("#")[0].split("?")[0];
      return `${clean}#join`;
    }
    return `${DATA.meta.prodBaseUrl || "https://smartwoo.github.io/racm303-2569-kuchinarai/"}#join`;
  }

  function isPureEmoji(str) {
    const clean = String(str || "").trim();
    if (!clean || clean.length > 14) return false;
    return !/[ก-๙A-Za-z0-9]/.test(clean);
  }

  function normWordKey(str) {
    return String(str || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /* VisualViewport On-Screen Keyboard Safe Inset for Mobile / Tablet */
  function syncKeyboardInset() {
    try {
      const vv = window.visualViewport;
      const winH = window.innerHeight || 800;
      const kb = vv ? Math.max(0, Math.round(winH - vv.height - (vv.offsetTop || 0))) : 0;
      document.documentElement.style.setProperty("--kb-inset", kb > 90 ? `${kb}px` : "0px");
    } catch (_) {}
  }
  if (typeof window !== "undefined" && window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncKeyboardInset, { passive: true });
  }

  /* ---------- 2. Pure-JS ISO/IEC 18004 QR Code SVG Generator ---------- */
  const QR_ECC_M = [
    null,
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44]
  ];
  const QR_ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGf() {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsRemainder(data, degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
      const nxt = new Array(poly.length + 1).fill(0);
      const root = GF_EXP[i];
      for (let j = 0; j < poly.length; j += 1) {
        nxt[j] ^= poly[j];
        nxt[j + 1] ^= gfMul(poly[j], root);
      }
      poly = nxt;
    }
    const rem = new Array(degree).fill(0);
    for (let i = 0; i < data.length; i += 1) {
      const factor = data[i] ^ rem[0];
      rem.shift();
      rem.push(0);
      for (let j = 0; j < degree; j += 1) rem[j] ^= gfMul(poly[j + 1], factor);
    }
    return rem;
  }

  function qrMaskBit(maskId, r, c) {
    if (maskId === 0) return (r + c) % 2 === 0;
    if (maskId === 1) return r % 2 === 0;
    if (maskId === 2) return c % 3 === 0;
    if (maskId === 3) return (r + c) % 3 === 0;
    if (maskId === 4) return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    if (maskId === 5) return ((r * c) % 2) + ((r * c) % 3) === 0;
    if (maskId === 6) return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }

  const qrCache = new Map();
  function buildQrSvg(text) {
    if (qrCache.has(text)) return qrCache.get(text);
    const raw = new TextEncoder().encode(String(text || getJoinUrl()));
    const n = raw.length;
    let ver = 10;
    for (let v = 1; v <= 10; v += 1) {
      const [, b1, d1, b2, d2] = QR_ECC_M[v];
      const totalData = b1 * d1 + b2 * d2;
      const lenBits = v <= 9 ? 8 : 16;
      if (4 + lenBits + n * 8 <= totalData * 8) {
        ver = v;
        break;
      }
    }
    const [ecCw, b1, d1, b2, d2] = QR_ECC_M[ver];
    const totalData = b1 * d1 + b2 * d2;
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i -= 1) bits.push((val >> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(n, ver <= 9 ? 8 : 16);
    for (let i = 0; i < n; i += 1) pushBits(raw[i], 8);
    pushBits(0, Math.min(4, totalData * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let k = 0; k < 8; k += 1) v = (v << 1) | bits[i + k];
      dataBytes.push(v);
    }
    let padIdx = 0;
    while (dataBytes.length < totalData) {
      dataBytes.push(padIdx % 2 === 0 ? 0xec : 0x11);
      padIdx += 1;
    }

    const blocksData = [];
    const blocksEc = [];
    let pos = 0;
    for (let i = 0; i < b1; i += 1) {
      const blk = dataBytes.slice(pos, pos + d1);
      pos += d1;
      blocksData.push(blk);
      blocksEc.push(rsRemainder(blk, ecCw));
    }
    for (let i = 0; i < b2; i += 1) {
      const blk = dataBytes.slice(pos, pos + d2);
      pos += d2;
      blocksData.push(blk);
      blocksEc.push(rsRemainder(blk, ecCw));
    }

    const interleaved = [];
    const maxD = Math.max(d1, d2);
    for (let i = 0; i < maxD; i += 1) {
      for (let bi = 0; bi < blocksData.length; bi += 1) {
        if (i < blocksData[bi].length) interleaved.push(blocksData[bi][i]);
      }
    }
    for (let i = 0; i < ecCw; i += 1) {
      for (let bi = 0; bi < blocksEc.length; bi += 1) interleaved.push(blocksEc[bi][i]);
    }

    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunc = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFunc = (r, c, dark) => {
      modules[r][c] = dark;
      isFunc[r][c] = true;
    };
    const drawFinder = (top, left) => {
      for (let dy = -1; dy <= 7; dy += 1) {
        for (let dx = -1; dx <= 7; dx += 1) {
          const r = top + dy;
          const c = left + dx;
          if (r >= 0 && r < size && c >= 0 && c < size) {
            const inOuter = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
            const inWhite = dy >= 1 && dy <= 5 && dx >= 1 && dx <= 5;
            const inCore = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
            setFunc(r, c, inOuter && (!inWhite || inCore));
          }
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);
    for (let i = 8; i < size - 8; i += 1) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }
    const apos = QR_ALIGN[ver];
    for (let ai = 0; ai < apos.length; ai += 1) {
      for (let aj = 0; aj < apos.length; aj += 1) {
        const cy = apos[ai];
        const cx = apos[aj];
        if ((cy === 6 && cx === 6) || (cy === 6 && cx === size - 7) || (cy === size - 7 && cx === 6)) continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) setFunc(cy + dy, cx + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
        }
      }
    }
    for (let i = 0; i < 9; i += 1) {
      if (i !== 6) {
        setFunc(8, i, false);
        setFunc(i, 8, false);
      }
    }
    for (let i = 0; i < 8; i += 1) {
      setFunc(8, size - 1 - i, false);
      setFunc(size - 1 - i, 8, false);
    }
    setFunc(size - 8, 8, true);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >> 11) & 1 ? 0x1f25 : 0);
      const vbits = (ver << 12) | rem;
      for (let i = 0; i < 18; i += 1) {
        const bit = ((vbits >> i) & 1) === 1;
        setFunc(size - 11 + (i % 3), Math.floor(i / 3), bit);
        setFunc(Math.floor(i / 3), size - 11 + (i % 3), bit);
      }
    }

    const allBits = [];
    for (let i = 0; i < interleaved.length; i += 1) {
      for (let b = 7; b >= 0; b -= 1) allBits.push((interleaved[i] >> b) & 1);
    }
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col -= 1;
      for (let step = 0; step < size; step += 1) {
        const r = upward ? size - 1 - step : step;
        for (let dc = 0; dc >= -1; dc -= 1) {
          const c = col + dc;
          if (!isFunc[r][c]) {
            modules[r][c] = bitIdx < allBits.length ? allBits[bitIdx] === 1 : false;
            bitIdx += 1;
          }
        }
      }
      upward = !upward;
    }

    const writeFormat = (mat, msk) => {
      const data = (0b00 << 3) | msk;
      let rem = data;
      for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0x537 : 0);
      const bits15 = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i < 6; i += 1) mat[i][8] = ((bits15 >> i) & 1) === 1;
      mat[7][8] = ((bits15 >> 6) & 1) === 1;
      mat[8][8] = ((bits15 >> 7) & 1) === 1;
      mat[8][7] = ((bits15 >> 8) & 1) === 1;
      for (let i = 9; i < 15; i += 1) mat[8][14 - i] = ((bits15 >> i) & 1) === 1;
      for (let i = 0; i < 8; i += 1) mat[8][size - 1 - i] = ((bits15 >> i) & 1) === 1;
      for (let i = 8; i < 15; i += 1) mat[size - 15 + i][8] = ((bits15 >> i) & 1) === 1;
      mat[size - 8][8] = true;
    };

    let bestMat = modules;
    let bestScore = 1e9;
    for (let msk = 0; msk < 8; msk += 1) {
      const cand = modules.map((row) => row.slice());
      for (let r = 0; r < size; r += 1) {
        for (let c = 0; c < size; c += 1) {
          if (!isFunc[r][c] && qrMaskBit(msk, r, c)) cand[r][c] = !cand[r][c];
        }
      }
      writeFormat(cand, msk);
      let score = 0;
      for (let r = 0; r < size; r += 1) {
        let run = 1;
        for (let c = 1; c < size; c += 1) {
          if (cand[r][c] === cand[r][c - 1]) {
            run += 1;
            if (run === 5) score += 3;
            else if (run > 5) score += 1;
          } else run = 1;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        bestMat = cand;
      }
    }

    const qz = 2;
    const vb = size + qz * 2;
    let pathD = "";
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (bestMat[r][c]) pathD += `M${c + qz},${r + qz}h1v1h-1z`;
      }
    }
    const svg = `<svg viewBox="0 0 ${vb} ${vb}" shape-rendering="crispEdges" role="img" aria-label="QR Code เข้าร่วมกลุ่มกุฉินารายณ์"><rect width="${vb}" height="${vb}" fill="#ffffff"/><path d="${pathD}" fill="#0f172a"/></svg>`;
    qrCache.set(text, svg);
    return svg;
  }

  /* ---------- 3. Lightweight Apple TV Sound Effects ---------- */
  let audioCtx = null;
  function playChime(freqs, durSec, type, vol) {
    if (state.muted) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx || audioCtx.state === "closed") audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      freqs.forEach((f, idx) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type || "triangle";
        osc.frequency.value = f;
        const t0 = audioCtx.currentTime + idx * (durSec * 0.52);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + durSec + 0.03);
      });
    } catch (_) {}
  }

  /* ---------- 4. State (ALWAYS Starts on Overview!) ---------- */
  const cliId = randId("cli");
  const persistentPid = (function () {
    let p = sGet("kuchi2569_pid", "");
    if (!p) {
      p = randId("p");
      sSet("kuchi2569_pid", p);
    }
    return p;
  })();

  const initialHash = (window.location.hash || "").replace(/^#/, "").trim();
  const startedFromQrJoin = initialHash.toLowerCase() === "join" || initialHash.toLowerCase() === "live";
  const initialDirectTarget = TARGET_MAP.has(initialHash) ? initialHash : "";

  const state = {
    // ALWAYS open directly on "overview" unless deep-linked to a specific person!
    view: initialDirectTarget ? "detail" : "overview",
    activeTargetId: initialDirectTarget || "m_smart",
    detailTab: "wordcloud", // "wordcloud" | "rating"
    overviewReturningFromId: "",
    isAnimatingZoomOut: false,
    dpadIndex: 0,

    sessionId: sGet("kuchi2569_session", "sg1_intro"),
    pointerSeq: 0,
    hideWordsUntilReveal: false,
    showComposerOnStage: true,
    muted: sGet("kuchi2569_muted", "0") === "1",

    // Roulette
    rouletteSpinning: false,
    rouletteFlashUid: "",
    pickedUids: new Set(),

    // Participant / Sync preferences
    myMemberUid: sGet("kuchi2569_my_uid", ""),
    myGuestName: sGet("kuchi2569_guest_name", ""),
    followHost: startedFromQrJoin,
    identityModalOpen: startedFromQrJoin && !sGet("kuchi2569_my_uid", "") && !sGet("kuchi2569_guest_name", ""),

    // Modals
    qrModalOpen: false,
    roadmapModalOpen: false,
    resultsModalTargetId: "",

    // Live synced data
    wordsByTarget: new Map(),
    ratingsByTarget: new Map(),
    presence: new Map(),

    // Transports
    mqttClients: [],
    bc: null,
    peer: null,
    peerConns: new Map(),
    hostConn: null,
    connectedCount: 0
  };

  /* Cache of last tile screen coordinates for Apple TV FLIP Zoom-In / Zoom-Out */
  const tileOriginCache = new Map();

  function setZoomOrigin(ox, oy) {
    const root = document.getElementById("appRoot");
    if (root) {
      root.style.setProperty("--zoom-ox", `${Math.round(ox)}px`);
      root.style.setProperty("--zoom-oy", `${Math.round(oy)}px`);
    }
  }

  function captureTileOrigin(targetId, elOpt) {
    const el = elOpt || document.querySelector(`[data-tile-id="${targetId}"]`);
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const pt = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        tileOriginCache.set(targetId, pt);
        setZoomOrigin(pt.cx, pt.cy);
        return;
      }
    }
    const cached = tileOriginCache.get(targetId);
    if (cached) {
      setZoomOrigin(cached.cx, cached.cy);
    } else {
      setZoomOrigin(window.innerWidth / 2, window.innerHeight / 2);
    }
  }

  /* ---------- 5. Apple TV Zoom-In & Zoom-Out Transitions ---------- */
  function zoomIntoTarget(targetId, sourceEl, isRemoteSync) {
    if (!TARGET_MAP.has(targetId)) return;
    state.overviewReturningFromId = "";
    state.isAnimatingZoomOut = false;

    if (state.view === "overview") {
      captureTileOrigin(targetId, sourceEl);
      const ov = document.querySelector(".tv-overview-stage");
      if (ov) ov.classList.add("is-zooming-away");
      playChime([440, 659.25], 0.12, "sine", 0.045);

      setTimeout(() => {
        state.view = "detail";
        state.activeTargetId = targetId;
        state.detailTab = "wordcloud";
        const tObj = TARGET_MAP.get(targetId);
        if (tObj && tObj.member) {
          state.pickedUids.add(tObj.member.uid);
          saveSessionStore();
        }
        if (!isRemoteSync) broadcastPointer();
        render();
      }, 150);
    } else {
      state.activeTargetId = targetId;
      state.detailTab = "wordcloud";
      const tObj = TARGET_MAP.get(targetId);
      if (tObj && tObj.member) {
        state.pickedUids.add(tObj.member.uid);
        saveSessionStore();
      }
      playChime([523.25, 659.25], 0.09, "sine", 0.04);
      if (!isRemoteSync) broadcastPointer();
      render();
    }
  }

  function zoomOutToOverview(isRemoteSync) {
    if (state.view === "overview" || state.isAnimatingZoomOut) return;
    const prevId = state.activeTargetId;
    captureTileOrigin(prevId, null);
    state.isAnimatingZoomOut = true;

    const stageEl = document.querySelector(".tv-zoom-stage-outer");
    if (stageEl) stageEl.classList.add("is-zooming-out");
    playChime([659.25, 440], 0.12, "sine", 0.045);

    setTimeout(() => {
      state.isAnimatingZoomOut = false;
      state.view = "overview";
      state.overviewReturningFromId = prevId;
      if (!isRemoteSync) broadcastPointer();
      render();
      setTimeout(() => {
        if (state.overviewReturningFromId === prevId) {
          state.overviewReturningFromId = "";
        }
      }, 950);
    }, 260);
  }

  function stepZoomedTarget(delta) {
    const idx = TARGET_LIST.findIndex((t) => t.id === state.activeTargetId);
    const nextIdx = (idx + delta + TARGET_LIST.length) % TARGET_LIST.length;
    zoomIntoTarget(TARGET_LIST[nextIdx].id, null, false);
  }

  function spinAppleTvRoulette() {
    if (state.rouletteSpinning) return;
    if (state.view !== "overview") {
      state.view = "overview";
      render();
    }

    let candidates = MEMBERS.filter((m) => !state.pickedUids.has(m.uid));
    if (candidates.length === 0) {
      state.pickedUids.clear();
      candidates = MEMBERS.slice();
    }
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    state.rouletteSpinning = true;

    const totalTicks = 20;
    let tick = 0;
    const runStep = () => {
      if (tick < totalTicks) {
        const pick = candidates[tick % candidates.length];
        state.rouletteFlashUid = pick.uid;
        document.querySelectorAll("[data-tile-id]").forEach((el) => {
          el.classList.toggle("is-roulette-flash", el.getAttribute("data-tile-id") === pick.uid);
        });
        playChime([370 + (tick % 6) * 48], 0.045, "sine", 0.04);
        tick += 1;
        setTimeout(runStep, 55 + Math.pow(tick / totalTicks, 2.15) * 190);
      } else {
        state.rouletteSpinning = false;
        state.rouletteFlashUid = winner.uid;
        playChime([523.25, 659.25, 783.99, 1046.5], 0.15, "triangle", 0.075);
        const winEl = document.querySelector(`[data-tile-id="${winner.uid}"]`);
        setTimeout(() => {
          state.rouletteFlashUid = "";
          zoomIntoTarget(winner.uid, winEl, false);
        }, 380);
      }
    };
    runStep();
  }

  /* ---------- 6. Session Local Persistence ---------- */
  function storageKeyForSession(sessId) {
    return `kuchi2569_store_${sessId || "sg1_intro"}`;
  }

  function saveSessionStore() {
    try {
      const wordsObj = {};
      state.wordsByTarget.forEach((m, tid) => {
        wordsObj[tid] = Array.from(m.values());
      });
      const ratingsObj = {};
      state.ratingsByTarget.forEach((m, tid) => {
        ratingsObj[tid] = Array.from(m.values());
      });
      sSet(
        storageKeyForSession(state.sessionId),
        JSON.stringify({
          words: wordsObj,
          ratings: ratingsObj,
          picked: Array.from(state.pickedUids)
        })
      );
    } catch (_) {}
  }

  function loadSessionStore(sessId) {
    state.wordsByTarget.clear();
    state.ratingsByTarget.clear();
    state.pickedUids.clear();
    try {
      const raw = sGet(storageKeyForSession(sessId), "");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.words) {
        Object.keys(parsed.words).forEach((tid) => {
          const mp = new Map();
          (parsed.words[tid] || []).forEach((item) => {
            if (item && item.subId && item.text) mp.set(item.subId, item);
          });
          state.wordsByTarget.set(tid, mp);
        });
      }
      if (parsed && parsed.ratings) {
        Object.keys(parsed.ratings).forEach((tid) => {
          const mp = new Map();
          (parsed.ratings[tid] || []).forEach((item) => {
            if (item && item.pid && Number.isFinite(Number(item.score))) mp.set(item.pid, item);
          });
          state.ratingsByTarget.set(tid, mp);
        });
      }
      if (parsed && Array.isArray(parsed.picked)) {
        parsed.picked.forEach((u) => state.pickedUids.add(u));
      }
    } catch (_) {}
  }

  loadSessionStore(state.sessionId);

  /* ---------- 7. Real-Time Multi-Transport Sync Engine ---------- */
  const seenMsgIds = new Set();
  function rememberMsg(id) {
    if (!id) return false;
    if (seenMsgIds.has(id)) return true;
    seenMsgIds.add(id);
    if (seenMsgIds.size > 2000) {
      const first = seenMsgIds.values().next().value;
      seenMsgIds.delete(first);
    }
    return false;
  }

  function publishPacket(subtopic, payload, retain) {
    const msg = Object.assign({}, payload, {
      msgId: randId("m"),
      senderCli: cliId,
      sessionId: state.sessionId,
      sentMs: Date.now()
    });
    rememberMsg(msg.msgId);
    const raw = JSON.stringify(msg);

    if (state.bc) {
      try {
        state.bc.postMessage({ subtopic, msg });
      } catch (_) {}
    }

    const fullTopic = `${TOPIC_ROOT}/${state.sessionId}/${subtopic}`;
    state.mqttClients.forEach((cl) => {
      try {
        if (cl && cl.connected) {
          cl.publish(fullTopic, raw, { qos: 0, retain: Boolean(retain) });
        }
      } catch (_) {}
    });

    const env = { subtopic, msg };
    state.peerConns.forEach((c) => {
      try {
        if (c && c.open) c.send(env);
      } catch (_) {}
    });
    if (state.hostConn && state.hostConn.open) {
      try {
        state.hostConn.send(env);
      } catch (_) {}
    }
  }

  function broadcastPointer() {
    state.pointerSeq += 1;
    publishPacket(
      "pointer",
      {
        type: "pointer",
        view: state.view,
        targetId: state.activeTargetId,
        detailTab: state.detailTab,
        pointerSeq: state.pointerSeq
      },
      true
    );
  }

  let snapshotTimer = 0;
  function scheduleSnapshotPublish() {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      const wordsCompact = {};
      state.wordsByTarget.forEach((mp, tid) => {
        wordsCompact[tid] = Array.from(mp.values()).slice(-160);
      });
      const ratingsCompact = {};
      state.ratingsByTarget.forEach((mp, tid) => {
        ratingsCompact[tid] = Array.from(mp.values());
      });
      publishPacket(
        "snapshot",
        {
          type: "snapshot",
          view: state.view,
          targetId: state.activeTargetId,
          detailTab: state.detailTab,
          words: wordsCompact,
          ratings: ratingsCompact,
          picked: Array.from(state.pickedUids)
        },
        true
      );
    }, 360);
  }

  function publishMyPresence() {
    const mem = MEMBER_MAP.get(state.myMemberUid);
    const nick = mem ? mem.nickname : state.myGuestName || "";
    if (!nick) return;
    const rec = {
      pid: persistentPid,
      memberUid: mem ? mem.uid : "",
      nick,
      photo: mem ? mem.photo : "",
      ts: Date.now()
    };
    state.presence.set(persistentPid, rec);
    publishPacket("presence", Object.assign({ type: "presence" }, rec), false);
  }

  function mergeSnapshot(msg) {
    let changed = false;
    if (msg.words && typeof msg.words === "object") {
      Object.keys(msg.words).forEach((tid) => {
        if (!state.wordsByTarget.has(tid)) state.wordsByTarget.set(tid, new Map());
        const mp = state.wordsByTarget.get(tid);
        (msg.words[tid] || []).forEach((w) => {
          if (w && w.subId && w.text && !mp.has(w.subId)) {
            mp.set(w.subId, w);
            changed = true;
          }
        });
      });
    }
    if (msg.ratings && typeof msg.ratings === "object") {
      Object.keys(msg.ratings).forEach((tid) => {
        if (!state.ratingsByTarget.has(tid)) state.ratingsByTarget.set(tid, new Map());
        const mp = state.ratingsByTarget.get(tid);
        (msg.ratings[tid] || []).forEach((r) => {
          if (r && r.pid && Number.isFinite(Number(r.score))) {
            const prev = mp.get(r.pid);
            if (!prev || (r.ts || 0) >= (prev.ts || 0)) {
              mp.set(r.pid, r);
              changed = true;
            }
          }
        });
      });
    }
    if (Array.isArray(msg.picked)) {
      msg.picked.forEach((u) => state.pickedUids.add(u));
    }
    if (changed) saveSessionStore();
    return changed;
  }

  function handleIncoming(subtopic, msg, isRetained) {
    if (!msg || typeof msg !== "object") return;
    if (msg.senderCli === cliId) return;
    if (rememberMsg(msg.msgId)) return;

    if (msg.sessionId && msg.sessionId !== state.sessionId) {
      if (state.followHost && (msg.type === "pointer" || msg.type === "snapshot") && !isRetained) {
        state.sessionId = msg.sessionId;
        sSet("kuchi2569_session", state.sessionId);
        loadSessionStore(state.sessionId);
      } else {
        return;
      }
    }

    if (msg.type === "pointer") {
      if (state.followHost && !isRetained) {
        if (msg.view === "overview") {
          zoomOutToOverview(true);
        } else if (msg.targetId && TARGET_MAP.has(msg.targetId)) {
          if (msg.detailTab) state.detailTab = msg.detailTab;
          zoomIntoTarget(msg.targetId, null, true);
        }
      } else if (state.followHost && isRetained && msg.targetId && TARGET_MAP.has(msg.targetId)) {
        state.view = msg.view === "overview" ? "overview" : "detail";
        state.activeTargetId = msg.targetId;
        if (msg.detailTab) state.detailTab = msg.detailTab;
        render();
      }
      return;
    }

    if (msg.type === "snapshot") {
      const changed = mergeSnapshot(msg);
      if (changed) renderPreservingFocus();
      return;
    }

    if (msg.type === "word_add") {
      const tid = String(msg.targetId || "");
      const item = msg.item;
      if (!tid || !item || !item.subId || !item.text) return;
      if (!state.wordsByTarget.has(tid)) state.wordsByTarget.set(tid, new Map());
      const mp = state.wordsByTarget.get(tid);
      if (!mp.has(item.subId)) {
        mp.set(item.subId, item);
        saveSessionStore();
        if (!isRetained && state.view === "detail" && state.activeTargetId === tid) {
          playChime([587.33, 880], 0.1, "sine", 0.045);
        }
        renderPreservingFocus();
      }
      return;
    }

    if (msg.type === "word_delete") {
      const tid = String(msg.targetId || "");
      const norm = String(msg.normKey || "");
      if (!tid || !norm || !state.wordsByTarget.has(tid)) return;
      const mp = state.wordsByTarget.get(tid);
      Array.from(mp.keys()).forEach((k) => {
        if (normWordKey(mp.get(k).text) === norm) mp.delete(k);
      });
      saveSessionStore();
      renderPreservingFocus();
      return;
    }

    if (msg.type === "clear_target") {
      const tid = String(msg.targetId || "");
      if (tid) {
        state.wordsByTarget.delete(tid);
        state.ratingsByTarget.delete(tid);
        saveSessionStore();
        renderPreservingFocus();
      }
      return;
    }

    if (msg.type === "rating_set") {
      const tid = String(msg.targetId || "");
      const rec = msg.record;
      if (!tid || !rec || !rec.pid) return;
      if (!state.ratingsByTarget.has(tid)) state.ratingsByTarget.set(tid, new Map());
      state.ratingsByTarget.get(tid).set(rec.pid, rec);
      saveSessionStore();
      renderPreservingFocus();
      return;
    }

    if (msg.type === "presence") {
      if (msg.pid && msg.nick) {
        state.presence.set(msg.pid, {
          pid: msg.pid,
          memberUid: msg.memberUid || "",
          nick: msg.nick,
          photo: msg.photo || "",
          ts: Date.now()
        });
        updateConnBadgeOnly();
      }
      return;
    }

    if (msg.type === "hello_request" && !isRetained) {
      if (state.wordsByTarget.size > 0 || state.ratingsByTarget.size > 0) {
        scheduleSnapshotPublish();
      }
    }
  }

  function initTransports() {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        state.bc = new BroadcastChannel(BC_NAME);
        state.bc.onmessage = (ev) => {
          if (ev && ev.data) handleIncoming(ev.data.subtopic, ev.data.msg, false);
        };
      } catch (_) {}
    }

    window.addEventListener("storage", (ev) => {
      if (ev.key === storageKeyForSession(state.sessionId)) {
        loadSessionStore(state.sessionId);
        renderPreservingFocus();
      }
    });

    if (window.mqtt && typeof window.mqtt.connect === "function") {
      BROKERS.forEach((url) => {
        try {
          const cl = window.mqtt.connect(url, {
            clientId: `kuchi_${cliId}_${Math.random().toString(36).slice(2, 6)}`,
            clean: true,
            connectTimeout: 7000,
            reconnectPeriod: 3500
          });
          cl.on("connect", () => {
            state.connectedCount += 1;
            try {
              cl.subscribe(`${TOPIC_ROOT}/+/+`, { qos: 0 });
            } catch (_) {}
            publishMyPresence();
            publishPacket("hello", { type: "hello_request" }, false);
            updateConnBadgeOnly();
          });
          cl.on("close", () => {
            state.connectedCount = Math.max(0, state.connectedCount - 1);
            updateConnBadgeOnly();
          });
          cl.on("message", (topic, payloadBuf, packet) => {
            try {
              const parts = String(topic || "").split("/");
              const subtopic = parts[parts.length - 1] || "";
              const parsed = JSON.parse(payloadBuf.toString());
              handleIncoming(subtopic, parsed, Boolean(packet && packet.retain));
            } catch (_) {}
          });
          state.mqttClients.push(cl);
        } catch (_) {}
      });
    }
  }

  /* ---------- 8. Viewport-Adaptive Word Cloud Spiral Engine ---------- */
  function getAggregatedWords(targetId) {
    const mp = state.wordsByTarget.get(targetId);
    if (!mp || mp.size === 0) return { items: [], uniqueRespondents: 0, totalSubmissions: 0 };

    const groups = new Map();
    const pids = new Set();
    mp.forEach((entry) => {
      const raw = String(entry.text || "").trim();
      if (!raw) return;
      if (entry.pid) pids.add(entry.pid);
      const key = normWordKey(raw);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          text: raw,
          count: 0,
          emojiOnly: isPureEmoji(raw),
          latestTs: entry.ts || 0
        });
      }
      const g = groups.get(key);
      g.count += 1;
      if ((entry.ts || 0) > g.latestTs) g.latestTs = entry.ts || 0;
    });

    const items = Array.from(groups.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.emojiOnly !== b.emojiOnly) return a.emojiOnly ? -1 : 1;
      return a.text.localeCompare(b.text, "th");
    });

    return {
      items,
      uniqueRespondents: pids.size || items.length,
      totalSubmissions: mp.size
    };
  }

  function computeAdaptiveWordCloud(items) {
    if (!items.length) return [];
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const isPortrait = vw < vh;
    const isCompact = vw <= 640;

    const W = isPortrait ? 680 : 1080;
    const H = isPortrait ? 760 : 520;
    const cx = W / 2;
    const cy = H / 2;
    const maxCount = Math.max(1, ...items.map((x) => x.count));
    const placed = [];

    const baseMin = isCompact ? 18 : 24;
    const baseRange = isCompact ? 28 : 48;

    return items.slice(0, 46).map((item, idx) => {
      const ratio = maxCount === 1 ? (idx === 0 ? 0.78 : 0.38) : (item.count - 1) / Math.max(1, maxCount - 1);
      let fontPx = Math.round(baseMin + ratio * baseRange);
      if (items.length > 22) fontPx = Math.round(fontPx * 0.86);
      if (item.emojiOnly) fontPx = Math.round(fontPx * 1.3);

      const charUnit = item.emojiOnly ? fontPx * 1.15 : fontPx * 0.57;
      const boxW = Math.min(W * 0.84, Math.max(fontPx * 1.2, item.text.length * charUnit + 24));
      const boxH = fontPx * 1.3 + 8;

      let bestX = cx;
      let bestY = cy;
      const spreadX = isPortrait ? 0.96 : 1.46;
      const spreadY = isPortrait ? 1.22 : 0.84;

      for (let step = 0; step < 540; step += 1) {
        const angle = step * 0.41 + idx * 0.83;
        const radius = step * 3.0;
        const tx = cx + Math.cos(angle) * radius * spreadX;
        const ty = cy + Math.sin(angle) * radius * spreadY;

        if (tx - boxW / 2 < 20 || tx + boxW / 2 > W - 20 || ty - boxH / 2 < 18 || ty + boxH / 2 > H - 18) {
          continue;
        }
        let collides = false;
        for (let j = 0; j < placed.length; j += 1) {
          const p = placed[j];
          if (Math.abs(tx - p.x) * 2 < boxW + p.w && Math.abs(ty - p.y) * 2 < boxH + p.h) {
            collides = true;
            break;
          }
        }
        if (!collides) {
          bestX = tx;
          bestY = ty;
          break;
        }
      }

      placed.push({ x: bestX, y: bestY, w: boxW, h: boxH });
      return Object.assign({}, item, {
        leftPct: Number(((bestX / W) * 100).toFixed(2)),
        topPct: Number(((bestY / H) * 100).toFixed(2)),
        fontPx,
        color: MENTI_COLORS[idx % MENTI_COLORS.length]
      });
    });
  }

  /* ---------- 9. Submit Word & Submit Rating ---------- */
  function submitWord(targetId, rawText) {
    const cleaned = String(rawText || "").trim().replace(/\s+/g, " ").slice(0, 54);
    if (!cleaned || !targetId) return false;

    const mem = MEMBER_MAP.get(state.myMemberUid);
    const entry = {
      subId: randId("w"),
      text: cleaned,
      pid: persistentPid,
      memberUid: mem ? mem.uid : "",
      nick: mem ? mem.nickname : state.myGuestName || "สมาชิกกลุ่ม",
      ts: Date.now()
    };

    if (!state.wordsByTarget.has(targetId)) state.wordsByTarget.set(targetId, new Map());
    state.wordsByTarget.get(targetId).set(entry.subId, entry);
    saveSessionStore();

    publishPacket("word_add", { type: "word_add", targetId, item: entry }, false);
    scheduleSnapshotPublish();
    playChime([659.25, 880], 0.09, "sine", 0.05);
    renderPreservingFocus();
    return true;
  }

  function submitRating(targetId, scoreVal, reasonText) {
    const score = Math.max(1, Math.min(5, Number(Number(scoreVal).toFixed(1))));
    if (!targetId || !Number.isFinite(score)) return;
    const mem = MEMBER_MAP.get(state.myMemberUid);
    const isOwner = Boolean(mem && mem.uid === targetId) || !mem;

    const rec = {
      pid: persistentPid,
      memberUid: mem ? mem.uid : "",
      nick: mem ? mem.nickname : state.myGuestName || "สมาชิกกลุ่ม",
      score,
      reason: String(reasonText || "").trim().slice(0, 140),
      isOwner,
      ts: Date.now()
    };

    if (!state.ratingsByTarget.has(targetId)) state.ratingsByTarget.set(targetId, new Map());
    state.ratingsByTarget.get(targetId).set(rec.pid, rec);
    saveSessionStore();

    publishPacket("rating_set", { type: "rating_set", targetId, record: rec }, false);
    scheduleSnapshotPublish();
    playChime([523.25, 659.25, 783.99], 0.11, "triangle", 0.06);
    renderPreservingFocus();
  }

  function loadLegacyDemoForSmart() {
    const tid = "m_smart";
    if (!state.wordsByTarget.has(tid)) state.wordsByTarget.set(tid, new Map());
    const mp = state.wordsByTarget.get(tid);
    (DATA.legacySampleSmart || []).forEach((sample, idx) => {
      for (let c = 0; c < sample.count; c += 1) {
        const subId = `legacy_${idx}_${c}`;
        mp.set(subId, {
          subId,
          text: sample.text,
          pid: `legacy_p_${(idx + c) % 10}`,
          memberUid: "",
          nick: "รุ่นพี่ Kuchi Gang",
          ts: Date.now()
        });
      }
    });
    saveSessionStore();
    scheduleSnapshotPublish();
    playChime([523.25, 659.25, 783.99, 1046.5], 0.12, "triangle", 0.06);
    renderPreservingFocus();
  }

  /* ---------- 10. Render Top Capsule + Overview + Zoomed Stage + Modals ---------- */
  function renderTopBarHtml() {
    const myMem = MEMBER_MAP.get(state.myMemberUid);
    const myLabel = myMem ? myMem.nickname : state.myGuestName || "เลือกชื่อ";

    return `
      <div class="tv-topbar-wrap">
        <header class="tv-topbar">
          <button type="button" class="tv-brand-btn" data-act="go-overview" title="กลับสู่หน้าภาพรวมทั้งหมด (Apple TV Overview)">
            <span class="tv-logo-badge">KG</span>
            <span class="tv-brand-titles">
              <span class="tv-brand-main">Kuchi Gang 2569 · รพร.กุฉินารายณ์</span>
              <span class="tv-brand-sub">กลุ่ม อ.ณัฐวุฒิ (พี่สมาร์ท) · แตะการ์ดเพื่อซูมถามโจทย์รายคน</span>
            </span>
          </button>

          <div class="tv-actions">
            ${
              state.view === "detail"
                ? `<button type="button" class="tv-pill-btn is-back-zoom" data-act="go-overview" title="ซูมกลับหน้าภาพรวม (Esc)">⤡ ภาพรวม 22 คน</button>`
                : ""
            }

            <select class="tv-pill-select" data-act="change-session" aria-label="เลือกรอบกิจกรรม">
              ${(DATA.sessions || [])
                .map((s) => `<option value="${esc(s.id)}" ${s.id === state.sessionId ? "selected" : ""}>${esc(s.shortLabel)}</option>`)
                .join("")}
            </select>

            <button type="button" class="tv-pill-btn is-roulette" data-act="spin-roulette" title="สุ่มการ์ดแนะนำตัวแบบ Apple TV (คีย์ลัด R)">
              🎲 <span>สุ่มคนถัดไป</span>
            </button>

            <button type="button" class="tv-pill-btn ${state.followHost ? "is-active" : ""} hide-mobile" data-act="toggle-follow" title="ซิงค์ซูมเข้า-ออกตามจอหน้าห้องอัตโนมัติ">
              ${state.followHost ? "🔄 ซิงค์ตามจอหลัก: เปิด" : "🔄 ซิงค์จอหลัก"}
            </button>

            <button type="button" class="tv-pill-btn" data-act="open-identity" title="ตั้งชื่อผู้ส่งคำสะท้อน">
              👤 <span>${esc(myLabel)}</span>
            </button>

            <button type="button" class="tv-pill-btn is-primary" data-act="open-qr" title="แสดง QR Code ให้เพื่อนสแกนเข้าห้องสด (คีย์ลัด Q)">
              📱 <span>QR</span>
            </button>

            <button type="button" class="tv-pill-btn hide-mobile" data-act="open-roadmap" title="แผนการเดินทางรถไฟ 10–19 ธ.ค. & 5 วัตถุประสงค์">
              🗺️ <span>ภารกิจ</span>
            </button>

            <button type="button" class="tv-pill-btn hide-mobile" data-act="print-overview" title="พิมพ์สมุดที่ระลึก / บันทึกเป็น PDF">
              🖨️ <span>PDF</span>
            </button>

            <button type="button" class="tv-pill-btn hide-mobile" data-act="toggle-fullscreen" title="เต็มจอ 16:9 (คีย์ลัด F)">
              ⛶
            </button>

            <span class="tv-live-chip ${state.connectedCount > 0 ? "" : "is-offline"}" id="tvConnBadge" data-act="open-qr">
              <span class="tv-live-dot"></span>
              <span>${state.connectedCount > 0 ? `Live` : `Local`}</span>
            </span>
          </div>
        </header>
      </div>
    `;
  }

  function renderOverviewHtml() {
    const onlineUids = new Set(Array.from(state.presence.values()).map((p) => p.memberUid).filter(Boolean));
    const totalWordsAll = Array.from(state.wordsByTarget.values()).reduce((sum, mp) => sum + mp.size, 0);
    const topicAgg = getAggregatedWords(TOPIC_TRIP_ID);

    return `
      <main class="tv-overview-stage${state.overviewReturningFromId ? " is-zooming-back" : ""}">
        <div class="tv-overview-banner">
          <div class="tv-overview-headline">
            <h1>ภาพรวมครอบครัวกุฉินารายณ์ 2569 (22 คน)</h1>
            <span class="tv-overview-hint">แตะการ์ดคนไหนก็ได้เพื่อ <strong>Zoom In</strong> เข้าสู่โจทย์ใหญ่สะท้อนตัวตน · กด <strong>Esc</strong> เพื่อซูมออก</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:13px;font-weight:700;color:#2563eb;background:#eff6ff;padding:4px 12px;border-radius:999px;border:1px solid #bfdbfe">
              ☁️ คำสะท้อนรวม ${totalWordsAll} คำ
            </span>
          </div>
        </div>

        <section class="tv-grid" id="tvOverviewGrid" aria-label="การ์ดสมาชิกกลุ่มกุฉินารายณ์ทั้ง 22 คน">
          ${MEMBERS.map((m, idx) => {
            const agg = getAggregatedWords(m.uid);
            const rMap = state.ratingsByTarget.get(m.uid) || new Map();
            const ownerRec = Array.from(rMap.values()).find((r) => r.isOwner || r.memberUid === m.uid);
            const topPreview = agg.items
              .slice(0, 4)
              .map((w) => `${w.text}${w.count > 1 ? ` ×${w.count}` : ""}`)
              .join(" · ");
            const badgeNum = m.kind === "student" ? `#${m.studentNo}` : m.kind === "advisor" ? "AJ" : "STAFF";
            const subInfo =
              m.kind === "student"
                ? `${m.firstName} · ${m.shortNo} (D${m.disc})`
                : `${m.firstName} · ${m.kind === "advisor" ? "อาจารย์ที่ปรึกษา" : "พี่ประสานงาน"}`;
            const isOnline = onlineUids.has(m.uid);
            const isReturned = state.overviewReturningFromId === m.uid;
            const isDpad = state.dpadIndex === idx;

            return `
              <button
                type="button"
                class="tv-tile${agg.totalSubmissions > 0 ? " is-has-words" : ""}${isReturned ? " is-just-returned" : ""}${isDpad ? " is-dpad-focus" : ""}"
                data-tile-id="${esc(m.uid)}"
                data-grid-idx="${idx}"
                data-act="zoom-in-target"
                data-target-id="${esc(m.uid)}"
              >
                <div class="tv-tile-avatar-wrap">
                  <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" loading="eager" />
                  <span class="tv-tile-num-pill">${esc(badgeNum)}</span>
                  ${isOnline ? `<span class="tv-tile-online-dot" title="ออนไลน์"></span>` : ""}
                </div>
                <div class="tv-tile-body">
                  <div class="tv-tile-toprow">
                    <span class="tv-tile-nick">${esc(m.nickname)}</span>
                    ${
                      agg.totalSubmissions > 0
                        ? `<span class="tv-tile-count-badge">☁️ ${agg.totalSubmissions}${ownerRec ? ` · ★${Number(ownerRec.score).toFixed(1)}` : ""}</span>`
                        : ""
                    }
                  </div>
                  <div class="tv-tile-sub">${esc(subInfo)}</div>
                  <div class="tv-tile-words${topPreview ? "" : " is-empty"}">
                    ${topPreview ? esc(topPreview) : "แตะเพื่อซูมถามโจทย์ ↗"}
                  </div>
                </div>
              </button>
            `;
          }).join("")}

          <!-- Tile 23: Group Expectations Word Cloud -->
          <button
            type="button"
            class="tv-tile is-special-topic${state.overviewReturningFromId === TOPIC_TRIP_ID ? " is-just-returned" : ""}${state.dpadIndex === 22 ? " is-dpad-focus" : ""}"
            data-tile-id="${TOPIC_TRIP_ID}"
            data-grid-idx="22"
            data-act="zoom-in-target"
            data-target-id="${TOPIC_TRIP_ID}"
          >
            <div class="tv-tile-avatar-wrap" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-size:28px">
              🚂
            </div>
            <div class="tv-tile-body">
              <div class="tv-tile-toprow">
                <span class="tv-tile-nick">ทริปกุฉินารายณ์</span>
                ${topicAgg.totalSubmissions > 0 ? `<span class="tv-tile-count-badge">☁️ ${topicAgg.totalSubmissions}</span>` : ""}
              </div>
              <div class="tv-tile-sub">ความคาดหวัง &amp; ภาพจำแรก</div>
              <div class="tv-tile-words${topicAgg.items.length ? "" : " is-empty"}">
                ${
                  topicAgg.items.length
                    ? esc(topicAgg.items.slice(0, 3).map((w) => w.text).join(" · "))
                    : "แตะส่งความคาดหวังทริป ↗"
                }
              </div>
            </div>
          </button>

          <!-- Tile 24: Instant QR Scan & Instructions -->
          <button
            type="button"
            class="tv-tile is-special-qr${state.dpadIndex === 23 ? " is-dpad-focus" : ""}"
            data-grid-idx="23"
            data-act="open-qr"
          >
            <div class="tv-tile-avatar-wrap" style="background:#fff;padding:4px">
              ${buildQrSvg(getJoinUrl())}
            </div>
            <div class="tv-tile-body">
              <div class="tv-tile-toprow">
                <span class="tv-tile-nick">QR เข้าห้องสด</span>
              </div>
              <div class="tv-tile-sub">สแกนส่งคำจากมือถือ/iPad</div>
              <div class="tv-tile-words" style="color:#93c5fd">แตะขยาย QR เต็มจอ ↗</div>
            </div>
          </button>
        </section>
      </main>
    `;
  }

  function renderZoomedDetailHtml() {
    const tObj = TARGET_MAP.get(state.activeTargetId) || TARGET_LIST[0];
    const m = tObj.member;
    const agg = getAggregatedWords(tObj.id);
    const positioned = computeAdaptiveWordCloud(agg.items);

    const rMap = state.ratingsByTarget.get(tObj.id) || new Map();
    const ratings = Array.from(rMap.values());
    const ownerRec = ratings.find((r) => r.isOwner || (m && r.memberUid === m.uid));
    const avg = ratings.length ? ratings.reduce((acc, r) => acc + Number(r.score || 0), 0) / ratings.length : 0;
    const displayScore = ownerRec ? Number(ownerRec.score) : avg;
    const scorePct = displayScore > 0 ? ((displayScore - 1) / 4) * 100 : 0;

    const bigQuestionHtml = m
      ? `หากต้องแนะนำ <span class="zm-highlight-name">'${esc(m.mentiName)}'</span> ให้ผู้อื่นรู้จักในระยะเวลาอันสั้น คุณจะใช้คำหรือประโยคใดที่สะท้อนความเป็นตัวตนได้มากที่สุด?`
      : `เมื่อพูดถึง <span class="zm-highlight-name">'ทริปรถไฟ &amp; รพร.กุฉินารายณ์ จ.กาฬสินธุ์'</span> คำหรือความคาดหวังแรกที่ผุดขึ้นมาในใจคุณคืออะไร?`;

    return `
      <main class="tv-zoom-stage-outer">
        <section class="menti-zoom-card" aria-live="polite">
          <div class="menti-decor" aria-hidden="true">
            <div class="menti-shape-blue-para"></div>
            <div class="menti-shape-pink-circle"></div>
            <div class="menti-shape-yellow-tri"></div>
            <div class="menti-shape-mint-arc"></div>
            <div class="menti-shape-purple-tri"></div>
          </div>

          <div class="zm-toolbar">
            <div class="zm-nav-group">
              <button type="button" class="tv-pill-btn is-back-zoom" data-act="go-overview">⤡ ซูมกลับภาพรวม (Esc)</button>
              <button type="button" class="tv-pill-btn ${state.detailTab === "wordcloud" ? "is-active" : ""}" data-act="set-detail-tab" data-tab="wordcloud">
                ☁️ Word Cloud (${agg.totalSubmissions})
              </button>
              ${
                m
                  ? `<button type="button" class="tv-pill-btn ${state.detailTab === "rating" ? "is-active" : ""}" data-act="set-detail-tab" data-tab="rating">⭐ ให้คะแนน 1–5${displayScore > 0 ? ` (${displayScore.toFixed(1)})` : ""}</button>`
                  : ""
              }
              <button type="button" class="tv-pill-btn" data-act="open-results" data-target-id="${esc(tObj.id)}">📊 ความถี่คำ</button>
            </div>

            <div class="zm-nav-group">
              <button type="button" class="tv-pill-btn" data-act="toggle-hide-words">${state.hideWordsUntilReveal ? "👁️ เฉลยคำ" : "🙈 ซ่อนรอเฉลย"}</button>
              <button type="button" class="tv-pill-btn" data-act="prev-person" title="คนก่อนหน้า">◀</button>
              <button type="button" class="tv-pill-btn is-roulette" data-act="spin-roulette">🎲 สุ่มคนถัดไป</button>
              <button type="button" class="tv-pill-btn" data-act="next-person" title="คนถัดไป">▶</button>
            </div>
          </div>

          <div class="zm-hero-header">
            ${
              m
                ? `
                  <div class="zm-person-portrait-card">
                    <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" />
                    <div class="zm-person-meta">
                      <span class="zm-person-kicker">${esc(m.kind === "student" ? `KUCHI GANG #${m.studentNo}/20 · DISC ${m.disc}` : m.roleBadge)}</span>
                      <span class="zm-person-nick">${esc(m.nickname)}</span>
                      <span class="zm-person-fullname">${esc(m.fullName)}${m.kind === "student" ? ` (${esc(m.id)})` : ""}</span>
                    </div>
                  </div>
                `
                : `
                  <div class="zm-person-portrait-card">
                    <div style="width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;display:flex;align-items:center;justify-content:center;font-size:34px">🚂</div>
                    <div class="zm-person-meta">
                      <span class="zm-person-kicker">10–19 ธ.ค. 2569 · จ.กาฬสินธุ์</span>
                      <span class="zm-person-nick">รพร.กุฉินารายณ์</span>
                      <span class="zm-person-fullname">โจทย์รวมประจำกลุ่มที่ 1</span>
                    </div>
                  </div>
                `
            }

            <h1 class="zm-big-question">${bigQuestionHtml}</h1>
          </div>

          ${
            state.detailTab === "rating" && m
              ? `
                <div class="zm-rating-wrap">
                  <div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center">
                    <strong style="font-size:14px;color:#475569">☁️ คำสะท้อนจากเพื่อนๆ:</strong>
                    ${
                      agg.items.length
                        ? agg.items
                            .slice(0, 12)
                            .map(
                              (w, i) =>
                                `<span style="padding:4px 11px;border-radius:999px;background:#eff6ff;font-weight:700;font-size:13.5px;color:${MENTI_COLORS[i % MENTI_COLORS.length]}">${esc(w.text)}${w.count > 1 ? ` ×${w.count}` : ""}</span>`
                            )
                            .join("")
                        : `<span style="color:#94a3b8;font-size:13.5px">ยังไม่มีคำสะท้อนใน Word Cloud</span>`
                    }
                  </div>

                  <div class="zm-scale-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
                      <strong style="font-size:clamp(16px,1.4vw,22px)">คิดว่าภาพรวม Word Cloud สะท้อนตัวตนจริงของ '${esc(m.mentiName)}' ได้ตรงแค่ไหน?</strong>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        ${
                          ownerRec
                            ? `<span style="padding:5px 13px;border-radius:999px;background:#fef3c7;border:1.5px solid #f59e0b;color:#92400e;font-weight:800;font-size:14px">★ คะแนนล่าสุด: ${Number(ownerRec.score).toFixed(1)} / 5.0</span>`
                            : ""
                        }
                        ${
                          ratings.length > 1
                            ? `<span style="padding:5px 13px;border-radius:999px;background:#eff6ff;border:1.5px solid #3b82f6;color:#1e40af;font-weight:800;font-size:14px">👥 เฉลี่ย ${avg.toFixed(2)} (${ratings.length} คน)</span>`
                            : ""
                        }
                      </div>
                    </div>

                    <div class="zm-track" data-act="click-rating-bar" data-target-id="${esc(tObj.id)}">
                      <div class="zm-track-fill" style="width:${displayScore > 0 ? scorePct : 0}%"></div>
                      ${displayScore > 0 ? `<div class="zm-track-knob" style="left:${scorePct}%">${displayScore.toFixed(1)}</div>` : ""}
                    </div>

                    <div style="display:flex;justify-content:space-between;font-weight:700;color:#475569;font-size:14px">
                      <span>1 · Strongly disagree</span>
                      <span>3 · Neutral</span>
                      <span>5 · Strongly agree</span>
                    </div>

                    <div style="display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap">
                      ${[1, 2, 3, 3.5, 4, 4.5, 5]
                        .map(
                          (sc) =>
                            `<button type="button" class="tv-pill-btn ${displayScore === sc ? "is-primary" : ""}" data-act="quick-rate" data-target-id="${esc(tObj.id)}" data-score="${sc}">ให้ ${sc}</button>`
                        )
                        .join("")}
                    </div>
                  </div>
                </div>
              `
              : `
                <div class="zm-cloud-body">
                  ${
                    state.hideWordsUntilReveal
                      ? `
                        <div class="zm-empty-prompt">
                          <strong>🙈 ซ่อนคำสะท้อนไว้ชั่วคราว (${agg.totalSubmissions} คำ จาก ${agg.uniqueRespondents} คน)</strong>
                          <p>เมื่อทุกคนส่งคำครบแล้ว กดปุ่มด้านล่างเพื่อเปิดเฉลย Word Cloud พร้อมกัน!</p>
                          <button type="button" class="tv-pill-btn is-primary" style="height:42px;padding:0 20px;font-size:15px" data-act="toggle-hide-words">✨ เปิดเฉลย Word Cloud!</button>
                        </div>
                      `
                      : positioned.length
                      ? `
                        <div class="zm-cloud-canvas">
                          ${positioned
                            .map(
                              (w, idx) => `
                                <span
                                  class="menti-word-item"
                                  style="left:${w.leftPct}%;top:${w.topPct}%;font-size:${w.fontPx}px;color:${w.color};z-index:${50 - idx}"
                                  title="${esc(w.text)} (${w.count} ครั้ง)"
                                  data-act="open-results"
                                  data-target-id="${esc(tObj.id)}"
                                >${esc(w.text)}${w.count > 1 ? `<sup class="menti-word-sup">×${w.count}</sup>` : ""}</span>
                              `
                            )
                            .join("")}
                        </div>
                      `
                      : `
                        <div class="zm-empty-prompt">
                          <strong>💬 ส่งคำหรือประโยคสะท้อนตัวตนของ '${esc(tObj.shortTitle)}' กันเลย!</strong>
                          <p>พิมพ์จากช่องด้านล่างได้ทันทีทั้งบนมือถือ แท็บเล็ต และคอมพิวเตอร์ หรือกดปุ่ม 📱 QR เพื่อให้เพื่อนทั้งห้องสแกนร่วมส่งสด</p>
                          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                            <button type="button" class="tv-pill-btn is-primary" data-act="open-qr">📱 เปิด QR Code สแกนเข้าห้อง</button>
                            ${
                              m && m.uid === "m_smart"
                                ? `<button type="button" class="tv-pill-btn" data-act="load-smart-demo">✨ โหลดตัวอย่างคำรุ่นพี่ Kuchi Gang</button>`
                                : ""
                            }
                          </div>
                        </div>
                      `
                  }
                </div>

                <form class="zm-composer-dock" data-form="send-word" data-target-id="${esc(tObj.id)}">
                  <div class="zm-composer-row">
                    <input
                      type="text"
                      id="zmWordInput"
                      name="word"
                      class="zm-word-input"
                      autocomplete="off"
                      placeholder="พิมพ์คำ หรือประโยคสั้นๆ ที่สะท้อน '${esc(tObj.shortTitle)}'..."
                      maxlength="54"
                    />
                    <button type="submit" class="zm-send-btn">ส่งขึ้นจอ 🚀</button>
                  </div>
                  <div class="zm-emoji-bar">
                    ${QUICK_EMOJIS.map((em) => `<button type="button" class="zm-emoji-btn" data-act="append-emoji" data-emoji="${em}">${em}</button>`).join("")}
                  </div>
                </form>
              `
          }
        </section>
      </main>
    `;
  }

  function renderModalsHtml() {
    let html = "";

    // 1. QR Instructions Modal
    if (state.qrModalOpen) {
      const joinUrl = getJoinUrl();
      const online = Array.from(state.presence.values());
      html += `
        <div class="tv-modal-backdrop" data-act="close-modals">
          <div class="tv-modal-card" style="max-width:520px;text-align:center" onclick="event.stopPropagation()">
            <h2 style="margin:0 0 6px;font-size:26px;font-weight:800">Instructions · สแกนเข้าห้องสด</h2>
            <p style="margin:0 0 16px;font-size:14.5px;color:#64748b">สแกนด้วยกล้องมือถือ / iPad เพื่อซิงค์ตามจอหลักและส่งคำเข้า Word Cloud สด</p>
            <div class="tv-qr-box">
              ${buildQrSvg(joinUrl)}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin:16px 0;padding:8px 12px;border-radius:12px;background:#f8fafc;border:1px solid #cbd5e1;font-family:var(--font-mono);font-size:12.5px;color:#1d4ed8;word-break:break-all">
              <span style="flex:1;text-align:left">${esc(joinUrl)}</span>
              <button type="button" class="tv-pill-btn" data-act="copy-url">คัดลอก</button>
            </div>
            ${
              online.length
                ? `<div style="font-size:13px;color:#166534;font-weight:700;margin-bottom:14px">👥 ออนไลน์ในห้องแล้ว ${online.length} คน: ${esc(online.map((p) => p.nick).join(", "))}</div>`
                : ""
            }
            <button type="button" class="tv-pill-btn is-primary" style="width:100%;height:42px" data-act="close-modals">พร้อมเริ่มกิจกรรม!</button>
          </div>
        </div>
      `;
    }

    // 2. Identity Picker Modal
    if (state.identityModalOpen) {
      html += `
        <div class="tv-modal-backdrop" data-act="close-modals">
          <div class="tv-modal-card" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <h3 style="margin:0;font-size:20px;font-weight:800">เลือกชื่อของคุณในกลุ่มกุฉินารายณ์ 👋</h3>
              <button type="button" class="tv-pill-btn" data-act="close-modals">✕ ปิด</button>
            </div>
            <p style="margin:0 0 14px;font-size:14px;color:#64748b">แตะรูปตัวเองครั้งเดียว ระบบจำชื่ออัตโนมัติและซิงค์เข้าห้องสดทันที</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:9px">
              ${MEMBERS.map(
                (m) => `
                  <button
                    type="button"
                    style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 6px;border-radius:16px;border:1.5px solid ${state.myMemberUid === m.uid ? "#2563eb" : "#e2e8f0"};background:${state.myMemberUid === m.uid ? "#eff6ff" : "#f8fafc"};cursor:pointer"
                    data-act="select-identity"
                    data-uid="${esc(m.uid)}"
                  >
                    <img src="${esc(m.photo)}" alt="${esc(m.nickname)}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;object-position:center 16%" />
                    <strong style="font-size:14px;color:#0f172a">${esc(m.nickname)}</strong>
                    <span style="font-size:11.5px;color:#64748b">${esc(m.kind === "student" ? m.shortNo : m.firstName)}</span>
                  </button>
                `
              ).join("")}
            </div>
          </div>
        </div>
      `;
    }

    // 3. Results Frequency Table Modal
    if (state.resultsModalTargetId) {
      const tid = state.resultsModalTargetId;
      const agg = getAggregatedWords(tid);
      const tObj = TARGET_MAP.get(tid);
      html += `
        <div class="tv-modal-backdrop" data-act="close-modals">
          <div class="tv-modal-card" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
              <h3 style="margin:0;font-size:20px;font-weight:800">📊 ความถี่คำสะท้อน — ${esc(tObj ? tObj.shortTitle : "")} (${agg.totalSubmissions} คำ)</h3>
              <div style="display:flex;gap:8px">
                <button type="button" class="tv-pill-btn" style="color:#dc2626;border-color:#fecaca" data-act="clear-target" data-target-id="${esc(tid)}">🗑️ ล้างสไลด์นี้</button>
                <button type="button" class="tv-pill-btn" data-act="close-modals">✕ ปิด</button>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:14.5px">
              <thead>
                <tr style="border-bottom:2px solid #e2e8f0;text-align:left">
                  <th style="padding:8px">คำ / ประโยค</th>
                  <th style="padding:8px;width:110px">ความถี่</th>
                  <th style="padding:8px;width:80px">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${
                  agg.items.length
                    ? agg.items
                        .map(
                          (item) => `
                            <tr style="border-bottom:1px solid #f1f5f9">
                              <td style="padding:8px;font-weight:700">${esc(item.text)}</td>
                              <td style="padding:8px">${item.count}</td>
                              <td style="padding:8px"><button type="button" class="tv-pill-btn" style="height:28px;font-size:12px" data-act="delete-word-norm" data-target-id="${esc(tid)}" data-norm="${esc(item.key)}">ลบ</button></td>
                            </tr>
                          `
                        )
                        .join("")
                    : `<tr><td colspan="3" style="padding:18px;text-align:center;color:#94a3b8">ยังไม่มีคำสะท้อน</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 4. Roadmap & 5 Objectives Modal
    if (state.roadmapModalOpen) {
      html += `
        <div class="tv-modal-backdrop" data-act="close-modals">
          <div class="tv-modal-card" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
              <h3 style="margin:0;font-size:20px;font-weight:800">🚂 เส้นทางกลุ่มที่ 1: รพร.กุฉินารายณ์ จ.กาฬสินธุ์</h3>
              <div style="display:flex;gap:8px">
                <a class="tv-pill-btn is-primary" href="${esc(DATA.meta.icsPath)}" download="RACM303_2569_Group1_Kuchinarai.ics">📅 ปฏิทิน .ics</a>
                <button type="button" class="tv-pill-btn" data-act="close-modals">✕ ปิด</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:14px">
              ${(DATA.roadmap || [])
                .map(
                  (r) => `
                    <div style="padding:12px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0">
                      <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#2563eb;color:#fff;font-size:11px;font-weight:800">${esc(r.step)}</span>
                      <div style="font-size:12px;font-weight:700;color:#475569;margin-top:4px">${esc(r.date)}</div>
                      <strong style="display:block;font-size:14.5px;margin:4px 0">${esc(r.title)}</strong>
                      <p style="margin:0;font-size:12.5px;color:#64748b;line-height:1.45">${esc(r.desc)}</p>
                    </div>
                  `
                )
                .join("")}
            </div>
            <button type="button" class="tv-pill-btn" data-act="export-json">💾 สำรองข้อมูลคำสะท้อนทั้งหมด (.json)</button>
          </div>
        </div>
      `;
    }

    return html;
  }

  function updateConnBadgeOnly() {
    const el = document.getElementById("tvConnBadge");
    if (!el) return;
    el.classList.toggle("is-offline", state.connectedCount <= 0);
    el.innerHTML = `<span class="tv-live-dot"></span><span>${state.connectedCount > 0 ? `Live` : `Local`}</span>`;
  }

  /* Re-render without losing text currently typed inside #zmWordInput */
  function renderPreservingFocus() {
    const activeEl = document.activeElement;
    const wasTypingWord = activeEl && activeEl.id === "zmWordInput";
    const draftVal = wasTypingWord ? activeEl.value : "";
    const selStart = wasTypingWord ? activeEl.selectionStart : null;

    render();

    if (wasTypingWord) {
      const nextInp = document.getElementById("zmWordInput");
      if (nextInp) {
        nextInp.value = draftVal;
        nextInp.focus();
        try {
          if (selStart !== null) nextInp.setSelectionRange(selStart, selStart);
        } catch (_) {}
      }
    }
  }

  function render() {
    const root = document.getElementById("appRoot");
    if (!root) return;
    root.innerHTML =
      renderTopBarHtml() +
      (state.view === "detail" ? renderZoomedDetailHtml() : renderOverviewHtml()) +
      renderModalsHtml();
  }

  /* ---------- 11. Event Delegation & Apple TV D-Pad / Keyboard Navigation ---------- */
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");

    if (act === "zoom-in-target") {
      const tid = btn.getAttribute("data-target-id");
      const gIdx = Number(btn.getAttribute("data-grid-idx"));
      if (Number.isFinite(gIdx)) state.dpadIndex = gIdx;
      zoomIntoTarget(tid, btn, false);
    } else if (act === "go-overview") {
      zoomOutToOverview(false);
    } else if (act === "spin-roulette") {
      spinAppleTvRoulette();
    } else if (act === "prev-person") {
      stepZoomedTarget(-1);
    } else if (act === "next-person") {
      stepZoomedTarget(1);
    } else if (act === "set-detail-tab") {
      state.detailTab = btn.getAttribute("data-tab") || "wordcloud";
      broadcastPointer();
      render();
    } else if (act === "toggle-hide-words") {
      state.hideWordsUntilReveal = !state.hideWordsUntilReveal;
      render();
    } else if (act === "toggle-follow") {
      state.followHost = !state.followHost;
      render();
    } else if (act === "open-qr") {
      state.qrModalOpen = true;
      render();
    } else if (act === "open-identity") {
      state.identityModalOpen = true;
      render();
    } else if (act === "open-roadmap") {
      state.roadmapModalOpen = true;
      render();
    } else if (act === "open-results") {
      state.resultsModalTargetId = btn.getAttribute("data-target-id") || "";
      render();
    } else if (act === "close-modals") {
      state.qrModalOpen = false;
      state.identityModalOpen = false;
      state.roadmapModalOpen = false;
      state.resultsModalTargetId = "";
      render();
    } else if (act === "select-identity") {
      const uid = btn.getAttribute("data-uid") || "";
      state.myMemberUid = uid;
      state.myGuestName = "";
      sSet("kuchi2569_my_uid", uid);
      sSet("kuchi2569_guest_name", "");
      state.identityModalOpen = false;
      publishMyPresence();
      render();
    } else if (act === "copy-url") {
      const u = getJoinUrl();
      if (navigator.clipboard) navigator.clipboard.writeText(u).catch(() => {});
      btn.textContent = "✓ คัดลอกแล้ว";
      setTimeout(() => {
        btn.textContent = "คัดลอก";
      }, 1400);
    } else if (act === "append-emoji") {
      const em = btn.getAttribute("data-emoji") || "";
      const inp = document.getElementById("zmWordInput");
      if (inp) {
        inp.value = (inp.value ? inp.value + " " : "") + em;
        inp.focus();
      }
    } else if (act === "load-smart-demo") {
      loadLegacyDemoForSmart();
    } else if (act === "quick-rate") {
      submitRating(btn.getAttribute("data-target-id"), Number(btn.getAttribute("data-score")), "");
    } else if (act === "click-rating-bar") {
      const rect = btn.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
      const sc = Math.round((1 + ratio * 4) * 2) / 2;
      submitRating(btn.getAttribute("data-target-id"), sc, "");
    } else if (act === "delete-word-norm") {
      const tid = btn.getAttribute("data-target-id");
      const norm = btn.getAttribute("data-norm");
      if (tid && norm && state.wordsByTarget.has(tid)) {
        const mp = state.wordsByTarget.get(tid);
        Array.from(mp.keys()).forEach((k) => {
          if (normWordKey(mp.get(k).text) === norm) mp.delete(k);
        });
        saveSessionStore();
        publishPacket("word_delete", { type: "word_delete", targetId: tid, normKey: norm }, false);
        scheduleSnapshotPublish();
        render();
      }
    } else if (act === "clear-target") {
      const tid = btn.getAttribute("data-target-id");
      if (tid) {
        state.wordsByTarget.delete(tid);
        state.ratingsByTarget.delete(tid);
        saveSessionStore();
        publishPacket("clear_target", { type: "clear_target", targetId: tid }, false);
        scheduleSnapshotPublish();
        render();
      }
    } else if (act === "toggle-fullscreen") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    } else if (act === "print-overview") {
      if (state.view !== "overview") {
        state.view = "overview";
        render();
      }
      setTimeout(() => window.print(), 120);
    } else if (act === "export-json") {
      const payload = {
        exportedAt: new Date().toISOString(),
        session: state.sessionId,
        words: Object.fromEntries(Array.from(state.wordsByTarget.entries()).map(([k, mp]) => [k, Array.from(mp.values())])),
        ratings: Object.fromEntries(Array.from(state.ratingsByTarget.entries()).map(([k, mp]) => [k, Array.from(mp.values())]))
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `KuchiGang2569_${state.sessionId}.json`;
      a.click();
    }
  });

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute("data-act") === "change-session") {
      state.sessionId = String(t.value || "sg1_intro");
      sSet("kuchi2569_session", state.sessionId);
      loadSessionStore(state.sessionId);
      scheduleSnapshotPublish();
      render();
    }
  });

  document.addEventListener("submit", (ev) => {
    const form = ev.target;
    if (!form || form.getAttribute("data-form") !== "send-word") return;
    ev.preventDefault();
    const tid = form.getAttribute("data-target-id");
    const inp = form.elements.word;
    if (inp && submitWord(tid, inp.value)) {
      inp.value = "";
    }
  });

  /* Apple TV D-Pad & Keyboard Shortcuts */
  document.addEventListener("keydown", (ev) => {
    const tag = (ev.target && ev.target.tagName) || "";
    const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if (ev.key === "Escape") {
      if (isTyping) {
        ev.target.blur();
        return;
      }
      if (state.qrModalOpen || state.identityModalOpen || state.roadmapModalOpen || state.resultsModalTargetId) {
        state.qrModalOpen = false;
        state.identityModalOpen = false;
        state.roadmapModalOpen = false;
        state.resultsModalTargetId = "";
        render();
        return;
      }
      if (state.view === "detail") {
        ev.preventDefault();
        zoomOutToOverview(false);
      }
      return;
    }

    if (isTyping) return;

    if (ev.key === "r" || ev.key === "R") {
      ev.preventDefault();
      spinAppleTvRoulette();
      return;
    }
    if (ev.key === "q" || ev.key === "Q") {
      ev.preventDefault();
      state.qrModalOpen = !state.qrModalOpen;
      render();
      return;
    }
    if (ev.key === "f" || ev.key === "F") {
      ev.preventDefault();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
      return;
    }

    if (state.view === "overview") {
      const gridEl = document.getElementById("tvOverviewGrid");
      const totalTiles = 24;
      let cols = 6;
      if (gridEl) {
        const tracks = window.getComputedStyle(gridEl).gridTemplateColumns.split(" ").filter(Boolean).length;
        if (tracks > 0) cols = tracks;
      }

      if (ev.key === "ArrowRight") {
        ev.preventDefault();
        state.dpadIndex = (state.dpadIndex + 1) % totalTiles;
        syncDpadHighlight();
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        state.dpadIndex = (state.dpadIndex - 1 + totalTiles) % totalTiles;
        syncDpadHighlight();
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        state.dpadIndex = (state.dpadIndex + cols) % totalTiles;
        syncDpadHighlight();
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        state.dpadIndex = (state.dpadIndex - cols + totalTiles) % totalTiles;
        syncDpadHighlight();
      } else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        const tile = document.querySelector(`[data-grid-idx="${state.dpadIndex}"]`);
        if (tile) tile.click();
      }
    } else if (state.view === "detail") {
      if (ev.key === "ArrowRight" || ev.key === "PageDown") {
        ev.preventDefault();
        stepZoomedTarget(1);
      } else if (ev.key === "ArrowLeft" || ev.key === "PageUp") {
        ev.preventDefault();
        stepZoomedTarget(-1);
      } else if (ev.key === "Backspace") {
        ev.preventDefault();
        zoomOutToOverview(false);
      }
    }
  });

  function syncDpadHighlight() {
    document.querySelectorAll("[data-grid-idx]").forEach((el) => {
      const match = Number(el.getAttribute("data-grid-idx")) === state.dpadIndex;
      el.classList.toggle("is-dpad-focus", match);
      if (match) {
        try {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch (_) {}
      }
    });
  }

  let resizeTimer = 0;
  window.addEventListener(
    "resize",
    () => {
      if (state.view !== "detail" || state.detailTab !== "wordcloud") return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderPreservingFocus(), 180);
    },
    { passive: true }
  );

  render();
  initTransports();
})();
