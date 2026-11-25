/* ==========================================================================
   RACM 303 (2569) — Kuchi Gang 2569 Interactive Presentation & Live Sync Engine
   - 21 Members (พี่สมาร์ท 1 + นศพ. 20 คน)
   - 3 Coordinated Entry Modes:
     1) facilitator.html (#facilitator): Slide 1 Giant QR Lobby + Master Big-Screen
        Navigation that FORCES every scanned phone to follow in lockstep!
     2) join.html (#join): Full-Screen Student Type-Answer Controller (Mentimeter/Kahoot)
        synced in real time to Facilitator's Big Screen while watching results on projector
     3) index.html: Direct 21-Card Apple TV Overview Board (7x3 on 16:9 PC) with
        Apple TV Zoom-In / Zoom-Out + 1-click switch to Facilitator Mode
   - Universal "← ย้อนกลับ (1 หน้าก่อนหน้า)" + "🏠 หน้าหลักใหญ่" in every view & modal
   - Zero stopPropagation() modal bug: every card & button is 100% clickable
   ========================================================================== */
(function () {
  "use strict";

  const DATA = window.KUCHI_DATA || { meta: {}, members: [], sessions: [], roadmap: [], objectives5: [] };
  const MEMBERS = (DATA.members || []).filter((m) => m && m.uid !== "m_fluke");
  const MEMBER_MAP = new Map(MEMBERS.map((m) => [m.uid, m]));

  const TOPIC_TRIP_ID = "topic_kuchinarai_expect";
  const TOPIC_ROOT = "racm303/2569/kuchi_gang/v2";
  const BC_NAME = "racm303_2569_kuchi_gang_bc_v2";
  const FAC_PEER_ID = "racm303-2569-kuchi-fac-master-v2";
  const LS_MASTER_PTR = "kuchi2569_master_ptr_v2";
  const BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://mqtt.eclipseprojects.io:443/mqtt"
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

  /* Ordered list of zoomable targets (21 members + 1 trip expectations topic) */
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

  /* ---------- 1. Helpers, URL Resolution & Safe Storage ---------- */
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

  function getBaseDirUrl() {
    if (typeof window !== "undefined" && /^https?:/i.test(window.location.protocol)) {
      const clean = window.location.href.split("#")[0].split("?")[0];
      return clean.replace(/\/[^/]*$/, "/");
    }
    return DATA.meta.prodBaseUrl || "https://smartwoo.github.io/racm303-2569-kuchinarai/";
  }

  /* Student-safe QR Join URL (Never points students to faculty-member domain!) */
  function getJoinUrl() {
    const base = getBaseDirUrl();
    let studentSafeBase = base;
    if (/racm303-2569-faculty-member/i.test(base)) {
      studentSafeBase = base.replace(/racm303-2569-faculty-member/gi, "racm303-2569-student");
    }
    const qs = state && state.sessionId && state.sessionId !== "sg1_intro" ? `?s=${encodeURIComponent(state.sessionId)}` : "";
    return `${studentSafeBase}join.html${qs}`;
  }

  function getFacilitatorUrl() {
    return `${getBaseDirUrl()}facilitator.html`;
  }

  function getOverviewPageUrl() {
    return `${getBaseDirUrl()}index.html`;
  }

  function resolveMainPortalUrl() {
    const href = String((typeof window !== "undefined" && window.location && window.location.href) || "");
    const ref = String((typeof document !== "undefined" && document.referrer) || "");
    if (state && state.role === "participant") {
      return DATA.meta.studentPortalUrl || "https://smartwoo.github.io/racm303-2569-student/";
    }
    if (/faculty-member/i.test(href) || /faculty-member/i.test(ref)) {
      return DATA.meta.facultyPortalUrl || "https://smartwoo.github.io/racm303-2569-faculty-member/";
    }
    return DATA.meta.studentPortalUrl || "https://smartwoo.github.io/racm303-2569-student/";
  }

  const NAV_ICONS = {
    back: `<svg class="tv-nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`,
    home: `<svg class="tv-nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    grid: `<svg class="tv-nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`
  };

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
    const targetText = String(text || getJoinUrl());
    if (qrCache.has(targetText)) return qrCache.get(targetText);
    const raw = new TextEncoder().encode(targetText);
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
    qrCache.set(targetText, svg);
    return svg;
  }

  /* ---------- 3. Lightweight Sound Effects ---------- */
  let audioCtx = null;
  function playChime(freqs, durSec, type, vol) {
    if (state && state.muted) return;
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

  /* ---------- 4. Role & State Initialization ---------- */
  const cliId = randId("cli");
  const persistentPid = (function () {
    let p = sGet("kuchi2569_pid", "");
    if (!p) {
      p = randId("p");
      sSet("kuchi2569_pid", p);
    }
    return p;
  })();

  const pathname = String((window.location && window.location.pathname) || "");
  const initialHash = String((window.location && window.location.hash) || "").replace(/^#/, "").trim();
  const urlParams = (function () {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch (_) {
      return { get: () => null };
    }
  })();

  const detectedRole = (function () {
    const explicit = String(window.KUCHI_ROLE || "").toLowerCase();
    const h = initialHash.toLowerCase();
    if (explicit === "facilitator" || /facilitator\.html$/i.test(pathname) || h === "facilitator" || h === "host") {
      return "facilitator";
    }
    if (explicit === "participant" || /join\.html$/i.test(pathname) || h === "join" || h === "live") {
      return "participant";
    }
    return "explorer";
  })();

  const initialDirectTarget = TARGET_MAP.has(initialHash) ? initialHash : "";
  const savedUidRaw = sGet("kuchi2569_my_uid", "");
  const sanitizedSavedUid = MEMBER_MAP.has(savedUidRaw) ? savedUidRaw : "";
  if (savedUidRaw && !sanitizedSavedUid) sSet("kuchi2569_my_uid", "");

  const paramSession = urlParams.get("s");
  const validSessionIds = new Set((DATA.sessions || []).map((s) => s.id));
  const initialSessionId = paramSession && validSessionIds.has(paramSession) ? paramSession : sGet("kuchi2569_session", "sg1_intro");
  if (paramSession && validSessionIds.has(paramSession)) {
    sSet("kuchi2569_session", initialSessionId);
  }

  const state = {
    role: detectedRole, // "facilitator" | "participant" | "explorer"
    // Facilitator starts on Slide 1 Giant QR Lobby ("lobby"); Explorer starts on 21-Member Overview ("overview")
    view: initialDirectTarget ? "detail" : detectedRole === "facilitator" ? "lobby" : "overview",
    activeTargetId: initialDirectTarget || "m_smart",
    detailTab: "wordcloud", // "wordcloud" | "rating"
    overviewReturningFromId: "",
    isAnimatingZoomOut: false,
    dpadIndex: 0,

    sessionId: initialSessionId,
    pointerSeq: 0,
    hideWordsUntilReveal: false,
    showComposerOnStage: detectedRole !== "facilitator", // Clean Big-Screen Results for Facilitator!
    muted: sGet("kuchi2569_muted", "0") === "1",

    // Roulette
    rouletteSpinning: false,
    rouletteFlashUid: "",
    pickedUids: new Set(),

    // Participant / Phone Controller State
    myMemberUid: sanitizedSavedUid,
    myGuestName: sGet("kuchi2569_guest_name", ""),
    followHost: detectedRole === "participant",
    hasSeenFacilitator: false,
    phonePickingIdentity: false,
    phoneManualOverride: false,
    phoneJustSubmittedTargetId: "",
    phoneDraftRating: 4.5,
    activeEmojiInputId: "phW1",

    // Modals (for Facilitator / Explorer)
    qrModalOpen: false,
    identityModalOpen: false,
    roadmapModalOpen: false,
    resultsModalTargetId: "",

    // Step-by-step navigation stack for "← ย้อนกลับ (1 หน้าก่อนหน้า)"
    navStack: [],

    // Live synced data
    wordsByTarget: new Map(),
    ratingsByTarget: new Map(),
    presence: new Map(),

    // Transports
    mqttClients: [],
    bc: null,
    peer: null,
    peerConns: new Map(),
    facPeerConn: null,
    connectedCount: 0
  };

  /* Restore last local master pointer immediately if Phone opens in same browser */
  if (state.role === "participant") {
    try {
      const rawPtr = sGet(LS_MASTER_PTR, "");
      if (rawPtr) {
        const ptr = JSON.parse(rawPtr);
        if (ptr && ptr.sentMs && Date.now() - ptr.sentMs < 4 * 3600 * 1000) {
          applyMasterPointerToPhone(ptr, true);
        }
      }
    } catch (_) {}
  }

  /* ---------- 5. Apple TV FLIP Origin Calculation ---------- */
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

  /* ---------- 6. Navigation History Stack + Apple TV Zoom Transitions ---------- */
  function captureNavSnap() {
    return {
      view: state.view,
      activeTargetId: state.activeTargetId,
      detailTab: state.detailTab,
      qrModalOpen: state.qrModalOpen,
      identityModalOpen: state.identityModalOpen,
      roadmapModalOpen: state.roadmapModalOpen,
      resultsModalTargetId: state.resultsModalTargetId,
      phonePickingIdentity: state.phonePickingIdentity,
      phoneJustSubmittedTargetId: state.phoneJustSubmittedTargetId
    };
  }

  function isSameSnap(a, b) {
    if (!a || !b) return false;
    return (
      a.view === b.view &&
      a.activeTargetId === b.activeTargetId &&
      a.detailTab === b.detailTab &&
      a.qrModalOpen === b.qrModalOpen &&
      a.identityModalOpen === b.identityModalOpen &&
      a.roadmapModalOpen === b.roadmapModalOpen &&
      a.resultsModalTargetId === b.resultsModalTargetId &&
      a.phonePickingIdentity === b.phonePickingIdentity &&
      a.phoneJustSubmittedTargetId === b.phoneJustSubmittedTargetId
    );
  }

  function pushNavHistory(snapOpt) {
    const snap = snapOpt || captureNavSnap();
    const top = state.navStack.length ? state.navStack[state.navStack.length - 1] : null;
    if (top && isSameSnap(top, snap)) return;
    state.navStack.push(snap);
    if (state.navStack.length > 60) state.navStack.shift();
  }

  function hasAnyOpenModal() {
    return Boolean(state.qrModalOpen || state.identityModalOpen || state.roadmapModalOpen || state.resultsModalTargetId);
  }

  function clearAllModals() {
    state.qrModalOpen = false;
    state.identityModalOpen = false;
    state.roadmapModalOpen = false;
    state.resultsModalTargetId = "";
  }

  function stepBackOneScreen() {
    if (state.isAnimatingZoomOut || state.rouletteSpinning) return;

    // Phone mode step-back handling
    if (state.role === "participant") {
      if (state.phonePickingIdentity && (state.myMemberUid || state.myGuestName)) {
        state.phonePickingIdentity = false;
        render();
        return;
      }
      if (state.phoneJustSubmittedTargetId) {
        state.phoneJustSubmittedTargetId = "";
        render();
        return;
      }
      if (state.phoneManualOverride && state.view === "detail") {
        state.view = "overview";
        render();
        return;
      }
      if (window.history.length > 1 && document.referrer) {
        window.history.back();
      } else {
        window.location.href = resolveMainPortalUrl();
      }
      return;
    }

    while (state.navStack.length > 0) {
      const prev = state.navStack.pop();
      if (isSameSnap(prev, captureNavSnap())) continue;

      const wasDetail = state.view === "detail" && !hasAnyOpenModal();
      state.qrModalOpen = Boolean(prev.qrModalOpen);
      state.identityModalOpen = Boolean(prev.identityModalOpen);
      state.roadmapModalOpen = Boolean(prev.roadmapModalOpen);
      state.resultsModalTargetId = prev.resultsModalTargetId || "";

      if (wasDetail && prev.view === "overview" && !hasAnyOpenModal()) {
        zoomOutToOverview(false, true);
        return;
      }

      if (state.view === "overview" && prev.view === "detail" && !hasAnyOpenModal()) {
        state.detailTab = prev.detailTab || "wordcloud";
        zoomIntoTarget(prev.activeTargetId || "m_smart", null, false, true);
        return;
      }

      state.view = prev.view || (state.role === "facilitator" ? "lobby" : "overview");
      state.activeTargetId = prev.activeTargetId || "m_smart";
      state.detailTab = prev.detailTab || "wordcloud";
      playChime([523.25, 440], 0.08, "sine", 0.04);
      broadcastMasterPointer(false);
      render();
      return;
    }

    if (hasAnyOpenModal()) {
      clearAllModals();
      render();
      return;
    }
    if (state.view === "detail") {
      zoomOutToOverview(false, true);
      return;
    }
    if (state.role === "facilitator" && state.view === "overview") {
      goToLobbySlide1(true);
      return;
    }

    if (window.history.length > 1 && document.referrer) {
      window.history.back();
    } else {
      window.location.href = resolveMainPortalUrl();
    }
  }

  function goToLobbySlide1(skipHistory) {
    if (!skipHistory) pushNavHistory();
    clearAllModals();
    state.view = "lobby";
    playChime([523.25, 659.25], 0.09, "sine", 0.04);
    broadcastMasterPointer(false);
    render();
  }

  function zoomIntoTarget(targetId, sourceEl, isRemoteSync, skipHistory) {
    if (!TARGET_MAP.has(targetId)) return;
    if (!isRemoteSync && !skipHistory) {
      pushNavHistory();
    }
    clearAllModals();
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
        if (!skipHistory && !isRemoteSync) state.detailTab = "wordcloud";
        const tObj = TARGET_MAP.get(targetId);
        if (tObj && tObj.member) {
          state.pickedUids.add(tObj.member.uid);
          saveSessionStore();
        }
        if (!isRemoteSync) broadcastMasterPointer(false);
        render();
      }, 150);
    } else {
      state.view = "detail";
      state.activeTargetId = targetId;
      if (!skipHistory && !isRemoteSync) state.detailTab = "wordcloud";
      const tObj = TARGET_MAP.get(targetId);
      if (tObj && tObj.member) {
        state.pickedUids.add(tObj.member.uid);
        saveSessionStore();
      }
      playChime([523.25, 659.25], 0.09, "sine", 0.04);
      if (!isRemoteSync) broadcastMasterPointer(false);
      render();
    }
  }

  function zoomOutToOverview(isRemoteSync, skipHistory) {
    if (hasAnyOpenModal()) {
      if (!isRemoteSync && !skipHistory) pushNavHistory();
      clearAllModals();
      if (state.view === "overview") {
        render();
        return;
      }
    }
    if (state.view === "lobby") {
      if (!isRemoteSync && !skipHistory) pushNavHistory();
      state.view = "overview";
      playChime([440, 587.33], 0.1, "sine", 0.045);
      if (!isRemoteSync) broadcastMasterPointer(false);
      render();
      return;
    }
    if (state.view === "overview" || state.isAnimatingZoomOut) return;
    if (!isRemoteSync && !skipHistory) {
      pushNavHistory();
    }
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
      if (!isRemoteSync) broadcastMasterPointer(false);
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
    zoomIntoTarget(TARGET_LIST[nextIdx].id, null, false, false);
  }

  function spinAppleTvRoulette() {
    if (state.rouletteSpinning) return;
    const preSpinSnap = captureNavSnap();
    clearAllModals();
    if (state.view !== "overview") {
      state.view = "overview";
      broadcastMasterPointer(false);
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
          pushNavHistory(preSpinSnap);
          zoomIntoTarget(winner.uid, winEl, false, true);
        }, 380);
      }
    };
    runStep();
  }

  /* ---------- 7. Session Local Persistence ---------- */
  function storageKeyForSession(sessId) {
    return `kuchi2569_store_${sessId || "sg1_intro"}`;
  }

  function saveSessionStore() {
    try {
      const wordsObj = {};
      state.wordsByTarget.forEach((m, tid) => {
        if (tid === "m_fluke") return;
        wordsObj[tid] = Array.from(m.values());
      });
      const ratingsObj = {};
      state.ratingsByTarget.forEach((m, tid) => {
        if (tid === "m_fluke") return;
        ratingsObj[tid] = Array.from(m.values());
      });
      sSet(
        storageKeyForSession(state.sessionId),
        JSON.stringify({
          words: wordsObj,
          ratings: ratingsObj,
          picked: Array.from(state.pickedUids).filter((u) => u !== "m_fluke")
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
          if (!TARGET_MAP.has(tid)) return;
          const mp = new Map();
          (parsed.words[tid] || []).forEach((item) => {
            if (item && item.subId && item.text) mp.set(item.subId, item);
          });
          state.wordsByTarget.set(tid, mp);
        });
      }
      if (parsed && parsed.ratings) {
        Object.keys(parsed.ratings).forEach((tid) => {
          if (!TARGET_MAP.has(tid)) return;
          const mp = new Map();
          (parsed.ratings[tid] || []).forEach((item) => {
            if (item && item.pid && Number.isFinite(Number(item.score))) mp.set(item.pid, item);
          });
          state.ratingsByTarget.set(tid, mp);
        });
      }
      if (parsed && Array.isArray(parsed.picked)) {
        parsed.picked.forEach((u) => {
          if (MEMBER_MAP.has(u)) state.pickedUids.add(u);
        });
      }
    } catch (_) {}
  }

  loadSessionStore(state.sessionId);

  /* ---------- 8. Real-Time Forced Sync Engine (MQTT + PeerJS + BroadcastChannel + Storage) ---------- */
  const seenMsgIds = new Set();
  function rememberMsg(id) {
    if (!id) return false;
    if (seenMsgIds.has(id)) return true;
    seenMsgIds.add(id);
    if (seenMsgIds.size > 2400) {
      const first = seenMsgIds.values().next().value;
      seenMsgIds.delete(first);
    }
    return false;
  }

  function publishPacket(topicSuffix, payload, retain) {
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
        state.bc.postMessage({ topicSuffix, msg });
      } catch (_) {}
    }

    const fullTopic = `${TOPIC_ROOT}/${topicSuffix}`;
    state.mqttClients.forEach((cl) => {
      try {
        if (cl && cl.connected) {
          cl.publish(fullTopic, raw, { qos: 0, retain: Boolean(retain) });
        }
      } catch (_) {}
    });

    const env = { topicSuffix, msg };
    state.peerConns.forEach((c) => {
      try {
        if (c && c.open) c.send(env);
      } catch (_) {}
    });
    if (state.facPeerConn && state.facPeerConn.open) {
      try {
        state.facPeerConn.send(env);
      } catch (_) {}
    }
  }

  /* ONLY Facilitator broadcasts authoritative master_pointer to lock all phones! */
  function broadcastMasterPointer(isHeartbeat) {
    if (state.role !== "facilitator") return;
    if (!isHeartbeat) state.pointerSeq += 1;
    const pkt = {
      type: "master_pointer",
      fromFacilitator: true,
      isHeartbeat: Boolean(isHeartbeat),
      sessionId: state.sessionId,
      view: state.view, // "lobby" | "overview" | "detail"
      targetId: state.activeTargetId,
      detailTab: state.detailTab,
      hideWords: state.hideWordsUntilReveal,
      pointerSeq: state.pointerSeq,
      sentMs: Date.now()
    };
    sSet(LS_MASTER_PTR, JSON.stringify(pkt));
    publishPacket("master/pointer", pkt, true);
  }

  let snapshotTimer = 0;
  function scheduleSnapshotPublish() {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      const wordsCompact = {};
      state.wordsByTarget.forEach((mp, tid) => {
        wordsCompact[tid] = Array.from(mp.values()).slice(-180);
      });
      const ratingsCompact = {};
      state.ratingsByTarget.forEach((mp, tid) => {
        ratingsCompact[tid] = Array.from(mp.values());
      });
      publishPacket(
        `${state.sessionId}/snapshot`,
        {
          type: "snapshot",
          words: wordsCompact,
          ratings: ratingsCompact,
          picked: Array.from(state.pickedUids)
        },
        true
      );
    }, 340);
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
      role: state.role,
      ts: Date.now()
    };
    state.presence.set(persistentPid, rec);
    publishPacket("global/presence", Object.assign({ type: "presence" }, rec), false);
  }

  function applyMasterPointerToPhone(msg, isInitialBoot) {
    if (!msg || !msg.fromFacilitator) return;
    state.hasSeenFacilitator = true;
    state.phoneManualOverride = false;

    let changed = false;
    if (msg.sessionId && validSessionIds.has(msg.sessionId) && msg.sessionId !== state.sessionId) {
      state.sessionId = msg.sessionId;
      sSet("kuchi2569_session", state.sessionId);
      loadSessionStore(state.sessionId);
      changed = true;
    }

    const nextView = msg.view === "detail" && TARGET_MAP.has(msg.targetId) ? "detail" : msg.view === "lobby" ? "lobby" : "overview";
    const nextTarget = TARGET_MAP.has(msg.targetId) ? msg.targetId : state.activeTargetId;
    const nextTab = msg.detailTab === "rating" ? "rating" : "wordcloud";

    if (state.view !== nextView || state.activeTargetId !== nextTarget || state.detailTab !== nextTab) {
      const targetChanged = state.activeTargetId !== nextTarget || state.view !== nextView;
      state.view = nextView;
      state.activeTargetId = nextTarget;
      state.detailTab = nextTab;
      if (targetChanged) {
        state.phoneJustSubmittedTargetId = "";
      }
      changed = true;

      if (!isInitialBoot && !msg.isHeartbeat && state.role === "participant" && nextView === "detail") {
        try {
          if (navigator.vibrate) navigator.vibrate(35);
        } catch (_) {}
        playChime([523.25, 783.99], 0.08, "sine", 0.035);
      }
    }

    if (changed && !isInitialBoot) {
      renderPreservingFocus();
    }
  }

  function mergeSnapshot(msg) {
    let changed = false;
    if (msg.words && typeof msg.words === "object") {
      Object.keys(msg.words).forEach((tid) => {
        if (!TARGET_MAP.has(tid)) return;
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
        if (!TARGET_MAP.has(tid)) return;
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
      msg.picked.forEach((u) => {
        if (MEMBER_MAP.has(u)) state.pickedUids.add(u);
      });
    }
    if (changed) saveSessionStore();
    return changed;
  }

  function handleIncoming(topicSuffix, msg, isRetained) {
    if (!msg || typeof msg !== "object") return;
    if (msg.senderCli === cliId) return;
    if (rememberMsg(msg.msgId)) return;

    // 1. Authoritative Facilitator Pointer -> Locks all Participant Phones (and Explorers with followHost=true)
    if (msg.type === "master_pointer" && msg.fromFacilitator) {
      if (isRetained && msg.sentMs && Date.now() - msg.sentMs > 6 * 3600 * 1000) {
        return;
      }
      if (state.role === "participant") {
        applyMasterPointerToPhone(msg, false);
      } else if (state.role === "explorer" && state.followHost) {
        if (msg.sessionId && validSessionIds.has(msg.sessionId) && msg.sessionId !== state.sessionId) {
          state.sessionId = msg.sessionId;
          loadSessionStore(state.sessionId);
        }
        if (msg.view === "detail" && TARGET_MAP.has(msg.targetId)) {
          state.detailTab = msg.detailTab || "wordcloud";
          if (state.view !== "detail" || state.activeTargetId !== msg.targetId) {
            zoomIntoTarget(msg.targetId, null, true, true);
          } else {
            renderPreservingFocus();
          }
        } else if (state.view === "detail") {
          zoomOutToOverview(true, true);
        }
      }
      return;
    }

    // 2. Global Presence Check-In (Updates Slide 1 Check-In Wall live!)
    if (msg.type === "presence") {
      if (msg.pid && msg.nick) {
        const hadUid = Array.from(state.presence.values()).some((p) => p.memberUid && p.memberUid === msg.memberUid);
        state.presence.set(msg.pid, {
          pid: msg.pid,
          memberUid: msg.memberUid || "",
          nick: msg.nick,
          photo: msg.photo || "",
          ts: Date.now()
        });
        if (state.role === "facilitator" && state.view === "lobby") {
          if (!hadUid && msg.memberUid && !isRetained) {
            playChime([587.33, 880], 0.08, "sine", 0.04);
          }
          renderPreservingFocus();
        } else {
          updateConnBadgeOnly();
        }
      }
      return;
    }

    // 3. Hello Request -> Facilitator immediately answers with master_pointer + snapshot!
    if (msg.type === "hello_request" && !isRetained) {
      if (state.role === "facilitator") {
        broadcastMasterPointer(true);
        scheduleSnapshotPublish();
      } else if (state.wordsByTarget.size > 0 || state.ratingsByTarget.size > 0) {
        scheduleSnapshotPublish();
      }
      publishMyPresence();
      return;
    }

    if (msg.sessionId && msg.sessionId !== state.sessionId) return;

    if (msg.type === "snapshot") {
      const changed = mergeSnapshot(msg);
      if (changed) renderPreservingFocus();
      return;
    }

    if (msg.type === "word_add") {
      const tid = String(msg.targetId || "");
      const item = msg.item;
      if (!tid || !TARGET_MAP.has(tid) || !item || !item.subId || !item.text) return;
      if (!state.wordsByTarget.has(tid)) state.wordsByTarget.set(tid, new Map());
      const mp = state.wordsByTarget.get(tid);
      if (!mp.has(item.subId)) {
        mp.set(item.subId, item);
        saveSessionStore();
        if (!isRetained && state.role !== "participant" && state.view === "detail" && state.activeTargetId === tid) {
          playChime([587.33, 880], 0.09, "sine", 0.04);
        }
        // On student phone, don't interrupt active typing when classmates submit words
        if (state.role !== "participant" || state.phoneJustSubmittedTargetId === tid) {
          renderPreservingFocus();
        }
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
      if (!tid || !TARGET_MAP.has(tid) || !rec || !rec.pid) return;
      if (!state.ratingsByTarget.has(tid)) state.ratingsByTarget.set(tid, new Map());
      state.ratingsByTarget.get(tid).set(rec.pid, rec);
      saveSessionStore();
      if (state.role !== "participant") renderPreservingFocus();
    }
  }

  function initTransports() {
    // A. Same-Browser Instant Sync (BroadcastChannel + storage event)
    if (typeof BroadcastChannel !== "undefined") {
      try {
        state.bc = new BroadcastChannel(BC_NAME);
        state.bc.onmessage = (ev) => {
          if (ev && ev.data) handleIncoming(ev.data.topicSuffix, ev.data.msg, false);
        };
      } catch (_) {}
    }

    window.addEventListener("storage", (ev) => {
      if (ev.key === LS_MASTER_PTR && ev.newValue && state.role === "participant") {
        try {
          applyMasterPointerToPhone(JSON.parse(ev.newValue), false);
        } catch (_) {}
      } else if (ev.key === storageKeyForSession(state.sessionId)) {
        loadSessionStore(state.sessionId);
        renderPreservingFocus();
      }
    });

    // B. Dual MQTT over WSS Brokers
    if (window.mqtt && typeof window.mqtt.connect === "function") {
      BROKERS.forEach((url) => {
        try {
          const cl = window.mqtt.connect(url, {
            clientId: `kuchi2_${cliId}_${Math.random().toString(36).slice(2, 6)}`,
            clean: true,
            connectTimeout: 7000,
            reconnectPeriod: 3000
          });
          cl.on("connect", () => {
            state.connectedCount += 1;
            try {
              cl.subscribe(`${TOPIC_ROOT}/#`, { qos: 0 });
            } catch (_) {}
            publishMyPresence();
            if (state.role === "facilitator") {
              broadcastMasterPointer(true);
              scheduleSnapshotPublish();
            } else {
              publishPacket("global/hello", { type: "hello_request" }, false);
            }
            updateConnBadgeOnly();
          });
          cl.on("close", () => {
            state.connectedCount = Math.max(0, state.connectedCount - 1);
            updateConnBadgeOnly();
          });
          cl.on("message", (topic, payloadBuf, packet) => {
            try {
              const suffix = String(topic || "").slice(TOPIC_ROOT.length + 1);
              const parsed = JSON.parse(payloadBuf.toString());
              handleIncoming(suffix, parsed, Boolean(packet && packet.retain));
            } catch (_) {}
          });
          state.mqttClients.push(cl);
        } catch (_) {}
      });
    }

    // C. PeerJS WebRTC Direct Facilitator-to-Phones Mesh Backup
    if (typeof window.Peer === "function") {
      try {
        if (state.role === "facilitator") {
          const peer = new window.Peer(FAC_PEER_ID);
          state.peer = peer;
          peer.on("open", () => {
            state.connectedCount += 1;
            updateConnBadgeOnly();
          });
          peer.on("connection", (conn) => {
            state.peerConns.set(conn.peer, conn);
            conn.on("open", () => {
              // Immediately sync newly connected phone to Facilitator's current slide!
              conn.send({
                topicSuffix: "master/pointer",
                msg: {
                  msgId: randId("m"),
                  senderCli: cliId,
                  type: "master_pointer",
                  fromFacilitator: true,
                  sessionId: state.sessionId,
                  view: state.view,
                  targetId: state.activeTargetId,
                  detailTab: state.detailTab,
                  hideWords: state.hideWordsUntilReveal,
                  pointerSeq: state.pointerSeq,
                  sentMs: Date.now()
                }
              });
            });
            conn.on("data", (env) => {
              if (env && env.msg) {
                handleIncoming(env.topicSuffix || "", env.msg, false);
                // Relay student submission to all other PeerJS-connected phones
                state.peerConns.forEach((other, pidKey) => {
                  if (pidKey !== conn.peer && other && other.open) {
                    try {
                      other.send(env);
                    } catch (_) {}
                  }
                });
              }
            });
            conn.on("close", () => state.peerConns.delete(conn.peer));
          });
          peer.on("error", () => {});
        } else if (state.role === "participant") {
          const peer = new window.Peer();
          state.peer = peer;
          const connectToFac = () => {
            if (!peer || peer.destroyed || (state.facPeerConn && state.facPeerConn.open)) return;
            try {
              const conn = peer.connect(FAC_PEER_ID, { reliable: true });
              state.facPeerConn = conn;
              conn.on("open", () => {
                state.connectedCount += 1;
                updateConnBadgeOnly();
                publishMyPresence();
                conn.send({
                  topicSuffix: "global/hello",
                  msg: { msgId: randId("m"), senderCli: cliId, type: "hello_request", sentMs: Date.now() }
                });
              });
              conn.on("data", (env) => {
                if (env && env.msg) handleIncoming(env.topicSuffix || "", env.msg, false);
              });
              conn.on("close", () => {
                state.connectedCount = Math.max(0, state.connectedCount - 1);
                updateConnBadgeOnly();
              });
            } catch (_) {}
          };
          peer.on("open", connectToFac);
          peer.on("error", () => {});
          setInterval(connectToFac, 8000);
        }
      } catch (_) {}
    }

    // D. Facilitator 3.5s Heartbeat + Participant Presence Heartbeat
    if (state.role === "facilitator") {
      setInterval(() => broadcastMasterPointer(true), 3500);
    }
    setInterval(() => {
      if (state.myMemberUid || state.myGuestName) publishMyPresence();
    }, 12000);
  }

  /* ---------- 9. Viewport-Adaptive Word Cloud Spiral Engine ---------- */
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

  function getMySentWordsForTarget(targetId) {
    const mp = state.wordsByTarget.get(targetId);
    if (!mp) return [];
    return Array.from(mp.values())
      .filter((w) => w && w.pid === persistentPid)
      .map((w) => w.text);
  }

  function computeAdaptiveWordCloud(items) {
    if (!items.length) return [];
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const isPortrait = vw < vh;
    const isCompact = vw <= 640;

    const W = isPortrait ? 680 : 1120;
    const H = isPortrait ? 760 : 540;
    const cx = W / 2;
    const cy = H / 2;
    const maxCount = Math.max(1, ...items.map((x) => x.count));
    const placed = [];

    const baseMin = isCompact ? 18 : 26;
    const baseRange = isCompact ? 28 : 52;

    return items.slice(0, 48).map((item, idx) => {
      const ratio = maxCount === 1 ? (idx === 0 ? 0.78 : 0.4) : (item.count - 1) / Math.max(1, maxCount - 1);
      let fontPx = Math.round(baseMin + ratio * baseRange);
      if (items.length > 22) fontPx = Math.round(fontPx * 0.86);
      if (item.emojiOnly) fontPx = Math.round(fontPx * 1.32);

      const charUnit = item.emojiOnly ? fontPx * 1.15 : fontPx * 0.57;
      const boxW = Math.min(W * 0.84, Math.max(fontPx * 1.2, item.text.length * charUnit + 24));
      const boxH = fontPx * 1.3 + 8;

      let bestX = cx;
      let bestY = cy;
      const spreadX = isPortrait ? 0.96 : 1.48;
      const spreadY = isPortrait ? 1.22 : 0.85;

      for (let step = 0; step < 560; step += 1) {
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

  /* ---------- 10. Submit Word(s) & Rating ---------- */
  function submitSingleWordPacket(targetId, rawText) {
    const cleaned = String(rawText || "").trim().replace(/\s+/g, " ").slice(0, 54);
    if (!cleaned || !targetId || !TARGET_MAP.has(targetId)) return false;

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
    publishPacket(`${state.sessionId}/word_add`, { type: "word_add", targetId, item: entry }, false);
    return true;
  }

  function submitWordBatch(targetId, textsArray) {
    let anySent = false;
    (textsArray || []).forEach((t) => {
      if (submitSingleWordPacket(targetId, t)) anySent = true;
    });
    if (!anySent) return false;
    saveSessionStore();
    scheduleSnapshotPublish();
    playChime([659.25, 880], 0.09, "sine", 0.05);
    renderPreservingFocus();
    return true;
  }

  function submitRating(targetId, scoreVal, reasonText) {
    const score = Math.max(1, Math.min(5, Number(Number(scoreVal).toFixed(1))));
    if (!targetId || !TARGET_MAP.has(targetId) || !Number.isFinite(score)) return;
    const mem = MEMBER_MAP.get(state.myMemberUid);
    const isOwner = Boolean(mem && mem.uid === targetId) || (state.role === "facilitator" && !mem);

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

    publishPacket(`${state.sessionId}/rating_set`, { type: "rating_set", targetId, record: rec }, false);
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

  /* ---------- 11. Render Views (Facilitator Lobby, 21-Card Overview, Zoom Stage, Student Phone) ---------- */
  function renderUniversalNavClusterHtml(showOverviewBtn) {
    const mainHomeUrl = resolveMainPortalUrl();
    return `
      <div class="tv-nav-pair" role="navigation" aria-label="ปุ่มย้อนกลับและหน้าหลัก">
        <button type="button" class="tv-pill-btn is-nav-back" data-act="nav-back" title="ย้อนกลับ 1 หน้าก่อนหน้านี้">
          ${NAV_ICONS.back}
          <span>ย้อนกลับ</span>
        </button>
        ${
          showOverviewBtn
            ? `<button type="button" class="tv-pill-btn is-nav-grid" data-act="go-overview" title="ไปหน้าภาพรวมกลุ่มกุฉินารายณ์ 21 คน">${NAV_ICONS.grid}<span>ภาพรวม 21 คน</span></button>`
            : ""
        }
        <a class="tv-pill-btn is-nav-home" href="${esc(mainHomeUrl)}" title="กลับหน้าหลักใหญ่พอร์ทัลรายวิชา RACM 303">
          ${NAV_ICONS.home}
          <span>หน้าหลักใหญ่</span>
        </a>
      </div>
    `;
  }

  function renderIdentityGridCardsHtml() {
    return `
      <div class="id-picker-grid">
        ${MEMBERS.map(
          (m) => `
            <button
              type="button"
              class="id-picker-card${state.myMemberUid === m.uid ? " is-selected" : ""}"
              data-act="select-identity"
              data-uid="${esc(m.uid)}"
            >
              <img src="${esc(m.photo)}" alt="${esc(m.nickname)}" loading="lazy" />
              <strong>${esc(m.nickname)}</strong>
              <span>${esc(m.kind === "student" ? `${m.firstName} · ${m.shortNo}` : "อาจารย์ที่ปรึกษา")}</span>
            </button>
          `
        ).join("")}
      </div>
    `;
  }

  /* --- A. Top Bar for Facilitator & Explorer --- */
  function renderTopBarHtml() {
    const isFac = state.role === "facilitator";
    const myMem = MEMBER_MAP.get(state.myMemberUid);
    const myLabel = myMem ? myMem.nickname : state.myGuestName || "เลือกชื่อ";
    const onlineMembers = new Set(Array.from(state.presence.values()).map((p) => p.memberUid).filter(Boolean));

    return `
      <div class="tv-topbar-wrap">
        <header class="tv-topbar">
          <div class="tv-left-dock">
            ${renderUniversalNavClusterHtml(state.view !== "overview")}
            <button type="button" class="tv-brand-btn" data-act="go-overview" title="หน้าภาพรวมครอบครัวกุฉินารายณ์ 21 คน">
              <span class="tv-logo-badge${isFac ? " is-fac" : ""}">${isFac ? "FAC" : "KG"}</span>
              <span class="tv-brand-titles">
                <span class="tv-brand-main">${isFac ? "Facilitator จอใหญ่ · Kuchi Gang 2569" : "Kuchi Gang 2569 · รพร.กุฉินารายณ์ (21 คน)"}</span>
                <span class="tv-brand-sub">${isFac ? "บังคับซิงค์มือถือผู้เรียนทุกเครื่องตามจอใหญ่อัตโนมัติ (Mentimeter Mode)" : "กลุ่ม อ.ณัฐวุฒิ (พี่สมาร์ท) · แตะการ์ดเพื่อซูมถามโจทย์รายคน"}</span>
              </span>
            </button>
          </div>

          <div class="tv-actions">
            <select class="tv-pill-select" data-act="change-session" aria-label="เลือกรอบกิจกรรม">
              ${(DATA.sessions || [])
                .map((s) => `<option value="${esc(s.id)}" ${s.id === state.sessionId ? "selected" : ""}>${esc(s.shortLabel)}</option>`)
                .join("")}
            </select>

            ${
              isFac
                ? `
                  <button type="button" class="tv-pill-btn ${state.view === "lobby" ? "is-primary" : ""}" data-act="go-lobby" title="กลับไป Slide 1 หน้าสแกน QR Code เต็มจอ">
                    📱 <span>Slide 1: QR (${onlineMembers.size}/21)</span>
                  </button>
                `
                : `
                  <a class="tv-pill-btn is-facilitator" href="${esc(getFacilitatorUrl())}" title="เปิดลิงก์ Facilitator สำหรับคุมจอใหญ่และบังคับมือถือวิ่งตามพร้อมกัน">
                    🎛️ <span>โหมด Facilitator (จอใหญ่)</span>
                  </a>
                `
            }

            <button type="button" class="tv-pill-btn is-roulette" data-act="spin-roulette" title="สุ่มการ์ดแนะนำตัวแบบ Apple TV (คีย์ลัด R)">
              🎲 <span>สุ่มคนถัดไป</span>
            </button>

            ${
              !isFac
                ? `
                  <button type="button" class="tv-pill-btn" data-act="open-identity" title="เลือกชื่อของคุณในกลุ่มกุฉินารายณ์">
                    👤 <span>${esc(myLabel)}</span>
                  </button>
                  <button type="button" class="tv-pill-btn is-primary" data-act="open-qr" title="แสดง QR Code เข้าโหมดมือถือ Full Type-Answer">
                    📱 <span>QR มือถือ</span>
                  </button>
                `
                : `
                  <button type="button" class="tv-pill-btn" data-act="open-qr" title="แสดงป๊อปอัป QR Code สำหรับคนมาทีหลัง">
                    📱 <span>QR ด่วน</span>
                  </button>
                `
            }

            <button type="button" class="tv-pill-btn hide-mobile" data-act="open-roadmap" title="แผนการเดินทางรถไฟ 10–19 ธ.ค. & 5 วัตถุประสงค์">
              🗺️ <span>ภารกิจ</span>
            </button>

            <button type="button" class="tv-pill-btn hide-mobile" data-act="print-overview" title="พิมพ์สมุดที่ระลึก 21 คน / บันทึกเป็น PDF">
              🖨️ <span>PDF</span>
            </button>

            <button type="button" class="tv-pill-btn hide-mobile" data-act="toggle-fullscreen" title="เต็มจอ 16:9 (คีย์ลัด F)">
              ⛶
            </button>

            <span class="tv-live-chip ${state.connectedCount > 0 ? "" : "is-offline"}" id="tvConnBadge" data-act="open-qr">
              <span class="tv-live-dot"></span>
              <span>${state.connectedCount > 0 ? "Live Sync" : "Local"}</span>
            </span>
          </div>
        </header>
      </div>
    `;
  }

  /* --- B. Slide 1: Facilitator Giant QR Lobby + 21-Member Live Check-In Wall --- */
  function renderFacilitatorLobbyHtml() {
    const joinUrl = getJoinUrl();
    const onlineUidSet = new Set(Array.from(state.presence.values()).map((p) => p.memberUid).filter(Boolean));
    const guestCount = Array.from(state.presence.values()).filter((p) => !p.memberUid && p.nick).length;

    return `
      <main class="fac-lobby-outer">
        <section class="fac-lobby-card" aria-label="Slide 1 สแกน QR Code เข้าห้องสด">
          <div class="menti-decor" aria-hidden="true">
            <div class="menti-shape-blue-para"></div>
            <div class="menti-shape-pink-circle"></div>
            <div class="menti-shape-mint-arc"></div>
            <div class="menti-shape-purple-tri"></div>
          </div>

          <div class="fac-qr-pane">
            <span class="fac-slide1-kicker">📱 SLIDE 1 · SCAN TO JOIN</span>
            <div class="fac-qr-giant">
              ${buildQrSvg(joinUrl)}
            </div>
            <div style="font-size:14px;font-weight:800;color:#0f172a">สแกนด้วยกล้องมือถือ / iPad เพื่อเข้าโหมดพิมพ์คำตอบเต็มจอ</div>
            <div class="fac-url-pill">
              <span style="flex:1">${esc(joinUrl)}</span>
              <button type="button" class="tv-pill-btn" style="height:28px;font-size:11.5px;padding:0 10px" data-act="copy-url">คัดลอก</button>
            </div>
          </div>

          <div class="fac-checkin-pane">
            <div>
              <h1 class="fac-lobby-title">ครอบครัวกุฉินารายณ์ · Kuchi Gang 2569 🚂</h1>
              <p class="fac-lobby-sub">
                เมื่อทุกคนสแกน QR Code แล้ว มือถือทุกเครื่องจะเข้าสู่โหมด <strong>Full Type-Answer เต็มตัว</strong> และ<strong>เปลี่ยนโจทย์ตามหน้าจอใหญ่นี้พร้อมกันอัตโนมัติ</strong> เพื่อดูผล Word Cloud ร่วมกันบนจอหลัก!
              </p>
            </div>

            <div class="fac-steps-row">
              <span class="fac-step-chip"><span class="fac-step-num">1</span> สแกน QR ด้านซ้าย</span>
              <span class="fac-step-chip"><span class="fac-step-num">2</span> แตะรูปชื่อตัวเอง (21 คน)</span>
              <span class="fac-step-chip"><span class="fac-step-num">3</span> พิมพ์คำตอบบนมือถือ &amp; ดูผลพร้อมกันบนจอใหญ่</span>
            </div>

            <div class="fac-checkin-header">
              <span class="fac-checkin-counter">
                🟢 เช็คอินเข้าห้องแล้ว ${onlineUidSet.size} / ${MEMBERS.length} คน${guestCount > 0 ? ` (+ผู้ร่วมฟัง ${guestCount})` : ""}
              </span>
              <span style="font-size:12.5px;color:#64748b;font-weight:600">คลิกที่รูปใครก็ได้เพื่อเริ่มถามคนนั้นทันที หรือกดปุ่มด้านล่าง</span>
            </div>

            <div class="fac-checkin-grid">
              ${MEMBERS.map((m) => {
                const isOn = onlineUidSet.has(m.uid);
                return `
                  <button
                    type="button"
                    class="fac-checkin-item${isOn ? " is-online" : ""}"
                    data-act="zoom-in-target"
                    data-target-id="${esc(m.uid)}"
                    title="${esc(m.fullName)} — คลิกเพื่อเปิดโจทย์ของ ${esc(m.nickname)}"
                  >
                    ${isOn ? `<span class="fac-ci-tick">✓</span>` : ""}
                    <img src="${esc(m.photo)}" alt="${esc(m.nickname)}" loading="eager" />
                    <span class="fac-ci-nick">${esc(m.nickname)}</span>
                  </button>
                `;
              }).join("")}
            </div>

            <div class="fac-cta-row">
              <button type="button" class="tv-pill-btn is-primary fac-cta-big" data-act="go-overview">
                ⊞ เปิดภาพรวมทั้ง 21 คน (เริ่มกิจกรรม →)
              </button>
              <button type="button" class="tv-pill-btn fac-cta-big" style="border-color:#93c5fd;background:#eff6ff;color:#1d4ed8" data-act="zoom-in-target" data-target-id="m_smart">
                ▶️ เริ่มโจทย์คนแรก: พี่สมาร์ท
              </button>
              <button type="button" class="tv-pill-btn is-roulette fac-cta-big" data-act="spin-roulette">
                🎲 สุ่มคนแรกทันที
              </button>
            </div>
          </div>
        </section>
      </main>
    `;
  }

  /* --- C. 21-Card Apple TV Overview Grid (7 x 3 on PC 16:9) --- */
  function renderOverviewHtml() {
    const onlineUids = new Set(Array.from(state.presence.values()).map((p) => p.memberUid).filter(Boolean));
    const totalWordsAll = Array.from(state.wordsByTarget.values()).reduce((sum, mp) => sum + mp.size, 0);
    const topicAgg = getAggregatedWords(TOPIC_TRIP_ID);

    return `
      <main class="tv-overview-stage${state.overviewReturningFromId ? " is-zooming-back" : ""}">
        <div class="tv-overview-banner">
          <div class="tv-overview-headline">
            <h1>ภาพรวมครอบครัวกุฉินารายณ์ 2569 (${MEMBERS.length} คน)</h1>
            <span class="tv-overview-hint">
              ${
                state.role === "facilitator"
                  ? "แตะการ์ดคนไหน มือถือทั้งห้องจะเด้งเข้าโหมดพิมพ์คำตอบของคนนั้นพร้อมกันทันที! · กด <strong>Esc</strong> เพื่อซูมออก"
                  : "แตะการ์ดเพื่อ <strong>Zoom In</strong> เข้าสู่โจทย์ใหญ่สะท้อนตัวตน · กด <strong>Esc</strong> เพื่อซูมออก"
              }
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button
              type="button"
              class="tv-pill-btn"
              style="background:#eff6ff;border-color:#93c5fd;color:#1d4ed8"
              data-act="zoom-in-target"
              data-target-id="${TOPIC_TRIP_ID}"
              data-tile-id="${TOPIC_TRIP_ID}"
            >
              🚂 โจทย์ความคาดหวังทริปกุฉินารายณ์${topicAgg.totalSubmissions > 0 ? ` (${topicAgg.totalSubmissions})` : ""}
            </button>
            <span style="font-size:13px;font-weight:700;color:#2563eb;background:#ffffff;padding:5px 12px;border-radius:999px;border:1px solid #bfdbfe">
              ☁️ รวม ${totalWordsAll} คำ
            </span>
          </div>
        </div>

        <section class="tv-grid" id="tvOverviewGrid" aria-label="การ์ดสมาชิกกลุ่มกุฉินารายณ์ทั้ง 21 คน">
          ${MEMBERS.map((m, idx) => {
            const agg = getAggregatedWords(m.uid);
            const rMap = state.ratingsByTarget.get(m.uid) || new Map();
            const ownerRec = Array.from(rMap.values()).find((r) => r.isOwner || r.memberUid === m.uid);
            const topPreview = agg.items
              .slice(0, 4)
              .map((w) => `${w.text}${w.count > 1 ? ` ×${w.count}` : ""}`)
              .join(" · ");
            const badgeNum = m.kind === "student" ? `#${m.studentNo}` : "AJ";
            const subInfo = m.kind === "student" ? `${m.firstName} · ${m.shortNo} (D${m.disc})` : `${m.firstName} · อาจารย์ที่ปรึกษา`;
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
                <div class="tv-tile-head">
                  <div class="tv-tile-avatar-wrap">
                    <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" loading="eager" />
                    <span class="tv-tile-num-pill">${esc(badgeNum)}</span>
                    ${isOnline ? `<span class="tv-tile-online-dot" title="เช็คอินออนไลน์แล้ว"></span>` : ""}
                  </div>
                  <div class="tv-tile-idbox">
                    <div class="tv-tile-toprow">
                      <span class="tv-tile-nick">${esc(m.nickname)}</span>
                      ${
                        agg.totalSubmissions > 0
                          ? `<span class="tv-tile-count-badge">☁️${agg.totalSubmissions}${ownerRec ? `·★${Number(ownerRec.score).toFixed(1)}` : ""}</span>`
                          : ""
                      }
                    </div>
                    <div class="tv-tile-sub">${esc(subInfo)}</div>
                  </div>
                </div>
                <div class="tv-tile-words${topPreview ? "" : " is-empty"}">
                  ${topPreview ? esc(topPreview) : "แตะเพื่อซูมถามโจทย์ ↗"}
                </div>
              </button>
            `;
          }).join("")}
        </section>
      </main>
    `;
  }

  /* --- D. Zoomed-In Big Question Result Stage --- */
  function renderZoomedDetailHtml() {
    const isFac = state.role === "facilitator";
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
              ${renderUniversalNavClusterHtml(true)}
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
              <button type="button" class="tv-pill-btn" data-act="toggle-hide-words">${state.hideWordsUntilReveal ? "👁️ เปิดเฉลยพร้อมกัน!" : "🙈 ซ่อนรอเฉลย"}</button>
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
                            .slice(0, 14)
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
                            ? `<span style="padding:5px 13px;border-radius:999px;background:#fef3c7;border:1.5px solid #f59e0b;color:#92400e;font-weight:800;font-size:14px">★ คะแนนเจ้าของชื่อ: ${Number(ownerRec.score).toFixed(1)} / 5.0</span>`
                            : ""
                        }
                        ${
                          ratings.length > 0
                            ? `<span style="padding:5px 13px;border-radius:999px;background:#eff6ff;border:1.5px solid #3b82f6;color:#1e40af;font-weight:800;font-size:14px">👥 เฉลี่ยทั้งห้อง ${avg.toFixed(2)} (${ratings.length} คน)</span>`
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

                    ${
                      ratings.some((r) => r.reason)
                        ? `
                          <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px">
                            ${ratings
                              .filter((r) => r.reason)
                              .slice(-8)
                              .map(
                                (r) =>
                                  `<div style="padding:6px 12px;border-radius:12px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px"><strong>${esc(r.nick)} (${Number(r.score).toFixed(1)}):</strong> ${esc(r.reason)}</div>`
                              )
                              .join("")}
                          </div>
                        `
                        : ""
                    }

                    <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap">
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
                          <strong>🙈 ซ่อนคำสะท้อนไว้รอเฉลยพร้อมกัน (${agg.totalSubmissions} คำ · จาก ${agg.uniqueRespondents} คน)</strong>
                          <p>ผู้เรียนกำลังพิมพ์ส่งคำจากมือถือ... เมื่อพร้อมแล้วกดปุ่มด้านล่างเพื่อเปิด Word Cloud บนจอใหญ่!</p>
                          <button type="button" class="tv-pill-btn is-primary" style="height:44px;padding:0 22px;font-size:15.5px" data-act="toggle-hide-words">✨ เปิดเฉลย Word Cloud พร้อมกัน!</button>
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
                          <strong>💬 รอรับคำสะท้อนตัวตนของ '${esc(tObj.shortTitle)}' แบบเรียลไทม์!</strong>
                          <p>${isFac ? "ขณะนี้มือถือทุกเครื่องที่สแกน QR เด้งเข้าช่องพิมพ์คำตอบของคนนี้แล้ว — คำที่ส่งจะลอยขึ้นมาบนจอใหญ่นี้ทันที!" : "พิมพ์คำหรือประโยคสั้นๆ จากช่องด้านล่าง หรือกดปุ่ม 📱 QR เพื่อให้เพื่อนสแกนร่วมส่งสด"}</p>
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

                ${
                  isFac && !state.showComposerOnStage
                    ? `
                      <div class="zm-fac-footer">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                          <button type="button" class="tv-pill-btn" data-act="open-qr">📱 QR สำหรับคนเข้าเพิ่ม</button>
                          <span style="font-size:13px;font-weight:700;color:#059669">📡 มือถือทุกเครื่องซิงค์อยู่ที่โจทย์นี้</span>
                        </div>
                        <div class="zm-fac-stat-pill">
                          💬 ส่งเข้ามาแล้ว ${agg.totalSubmissions} คำ · จากผู้ตอบ ${agg.uniqueRespondents} คน
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                          <button type="button" class="tv-pill-btn" data-act="toggle-stage-composer">⌨️ พิมพ์เสริมจากจอนี้</button>
                          ${m ? `<button type="button" class="tv-pill-btn" data-act="set-detail-tab" data-tab="rating">⭐ ไปหน้าโหวต 1–5 →</button>` : ""}
                        </div>
                      </div>
                    `
                    : `
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
                          ${isFac ? `<button type="button" class="tv-pill-btn" data-act="toggle-stage-composer" title="ซ่อนแถบพิมพ์เพื่อให้เห็นผลเต็มจอ">ซ่อนช่องพิมพ์</button>` : ""}
                        </div>
                        <div class="zm-emoji-bar">
                          ${QUICK_EMOJIS.map((em) => `<button type="button" class="zm-emoji-btn" data-act="append-emoji" data-emoji="${em}">${em}</button>`).join("")}
                        </div>
                      </form>
                    `
                }
              `
          }
        </section>
      </main>
    `;
  }

  /* --- E. Full-Screen Student Type-Answer Phone Controller (join.html / #join) --- */
  function renderParticipantPhoneHtml() {
    const myMem = MEMBER_MAP.get(state.myMemberUid);
    const hasIdentity = Boolean(myMem || state.myGuestName);
    const myDisplayName = myMem ? myMem.nickname : state.myGuestName || "เลือกชื่อ";

    const topBar = `
      <div class="tv-topbar-wrap">
        <header class="tv-topbar">
          <div class="tv-left-dock">
            ${renderUniversalNavClusterHtml(false)}
          </div>
          <div class="tv-actions">
            ${
              hasIdentity
                ? `
                  <button type="button" class="tv-pill-btn" data-act="phone-pick-name" title="แตะเพื่อเปลี่ยนชื่อผู้ตอบ">
                    👤 <span>${esc(myDisplayName)}</span>
                  </button>
                `
                : ""
            }
            <span class="tv-live-chip ${state.connectedCount > 0 ? "" : "is-offline"}" id="tvConnBadge">
              <span class="tv-live-dot"></span>
              <span>${state.connectedCount > 0 ? "ซิงค์จอใหญ่" : "กำลังเชื่อม..."}</span>
            </span>
          </div>
        </header>
      </div>
    `;

    // Step 1: Pick Identity from 21 Kuchi Gang Members (100% Clickable!)
    if (!hasIdentity || state.phonePickingIdentity) {
      return (
        topBar +
        `
          <main class="ph-shell">
            <section class="ph-card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div>
                  <h1 style="margin:0 0 4px;font-size:21px;font-weight:800;color:#0f172a">เลือกชื่อของคุณในกลุ่มกุฉินารายณ์ 👋</h1>
                  <p style="margin:0;font-size:13.5px;color:#64748b">แตะรูปตัวเองครั้งเดียว เพื่อเช็คอินขึ้นจอใหญ่และเข้าสู่โหมดพิมพ์คำตอบเต็มตัว (21 คน)</p>
                </div>
                ${
                  hasIdentity
                    ? `<button type="button" class="tv-pill-btn" data-act="phone-cancel-pick">✕ ปิด</button>`
                    : ""
                }
              </div>

              ${renderIdentityGridCardsHtml()}

              <form data-form="guest-identity" style="display:flex;gap:8px;padding-top:10px;border-top:1px solid #e2e8f0">
                <input
                  type="text"
                  name="guestName"
                  class="ph-answer-input"
                  style="height:40px;font-size:15px"
                  placeholder="หรือพิมพ์ชื่อเล่น (กรณีอาจารย์/แขกร่วมกิจกรรม)..."
                  maxlength="24"
                  value="${esc(state.myGuestName)}"
                />
                <button type="submit" class="tv-pill-btn is-primary" style="height:40px;padding:0 16px">ตกลง</button>
              </form>
            </section>
          </main>
        `
      );
    }

    // Step 2: Standby View when Facilitator is on Slide 1 (QR Lobby) or 21-Card Overview
    if (state.view !== "detail" && !state.phoneManualOverride) {
      const stageLabel =
        state.view === "lobby"
          ? "📱 จอใหญ่กำลังเปิด Slide 1 รอเพื่อนสแกน QR เข้าห้องครบทุกคน"
          : "⊞ จอใหญ่กำลังอยู่ที่หน้าภาพรวม 21 คน (กำลังสุ่ม/เลือกคนถัดไป...)";

      return (
        topBar +
        `
          <main class="ph-shell">
            <section class="ph-card">
              <div class="ph-sync-banner">
                <span>📡 เชื่อมต่อจอใหญ่สำเร็จ · บังคับเปลี่ยนข้อตาม Facilitator อัตโนมัติ</span>
              </div>

              <div class="ph-standby-box">
                <div class="ph-pulse-ring">
                  ${
                    myMem
                      ? `<img src="${esc(myMem.photo)}" alt="${esc(myMem.nickname)}" />`
                      : `<div style="width:100%;height:100%;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:28px">👋</div>`
                  }
                </div>
                <h2 style="margin:4px 0 0;font-size:22px;font-weight:800;color:#0f172a">สวัสดี ${esc(myDisplayName)}! เช็คอินเรียบร้อย ✅</h2>
                <div style="padding:6px 14px;border-radius:999px;background:#f1f5f9;color:#334155;font-size:13px;font-weight:700">
                  ${stageLabel}
                </div>
                <p style="margin:2px 0 0;font-size:14.5px;color:#475569;line-height:1.5;max-width:440px">
                  👀 <strong>เงยหน้าดูจอใหญ่พร้อมกัน</strong> — ทันทีที่อาจารย์เปิดโจทย์ของเพื่อนคนถัดไป หน้าจอมือถือนี้จะเปลี่ยนเป็นช่องพิมพ์คำตอบเต็มจอให้อัตโนมัติทันที!
                </p>
              </div>

              ${
                !state.hasSeenFacilitator
                  ? `
                    <div style="border-top:1px dashed #e2e8f0;padding-top:12px;text-align:center">
                      <button type="button" class="tv-pill-btn" data-act="phone-enable-manual">
                        เลือกคนเพื่อส่งคำล่วงหน้าด้วยตัวเอง (กรณีไม่ได้อยู่ในห้องสด)
                      </button>
                    </div>
                  `
                  : ""
              }
            </section>
          </main>
        `
      );
    }

    // Optional Manual Picker if outside live session and user explicitly requested it
    if (state.phoneManualOverride && state.view !== "detail") {
      return (
        topBar +
        `
          <main class="ph-shell">
            <section class="ph-card">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong style="font-size:17px">แตะเลือกสมาชิกที่ต้องการส่งคำสะท้อน</strong>
                <button type="button" class="tv-pill-btn" data-act="phone-disable-manual">กลับโหมดรอจอใหญ่</button>
              </div>
              <div class="id-picker-grid">
                ${MEMBERS.map(
                  (m) => `
                    <button type="button" class="id-picker-card" data-act="phone-manual-target" data-target-id="${esc(m.uid)}">
                      <img src="${esc(m.photo)}" alt="${esc(m.nickname)}" loading="lazy" />
                      <strong>${esc(m.nickname)}</strong>
                      <span>${esc(m.firstName)}</span>
                    </button>
                  `
                ).join("")}
              </div>
            </section>
          </main>
        `
      );
    }

    // Step 3: Active Question on Phone (Full Type-Answer Mode OR Full 1-5 Rating Mode)
    const tObj = TARGET_MAP.get(state.activeTargetId) || TARGET_LIST[0];
    const m = tObj.member;
    const mySentWords = getMySentWordsForTarget(tObj.id);
    const rMap = state.ratingsByTarget.get(tObj.id) || new Map();
    const myPrevRating = rMap.get(persistentPid);

    const bigQuestionHtml = m
      ? `หากต้องแนะนำ <span class="zm-highlight-name">'${esc(m.mentiName)}'</span> ให้ผู้อื่นรู้จักในระยะเวลาอันสั้น คุณจะใช้คำหรือประโยคใดที่สะท้อนความเป็นตัวตนได้มากที่สุด?`
      : `เมื่อพูดถึง <span class="zm-highlight-name">'ทริปรถไฟ &amp; รพร.กุฉินารายณ์'</span> คำหรือความคาดหวังแรกที่ผุดขึ้นมาในใจคุณคืออะไร?`;

    // 3B. Rating Scale 1–5 Controller on Phone
    if (state.detailTab === "rating" && m) {
      const currentVal = myPrevRating ? Number(myPrevRating.score) : state.phoneDraftRating;
      const isSelf = state.myMemberUid === m.uid;
      return (
        topBar +
        `
          <main class="ph-shell">
            <section class="ph-card">
              <div class="ph-sync-banner">
                <span>⭐ โหมดให้คะแนน 1–5 · ดูผลกราฟสดบนจอใหญ่</span>
                ${state.phoneManualOverride ? `<button type="button" class="tv-pill-btn" style="height:26px;font-size:11.5px" data-act="phone-manual-back-list">เปลี่ยนคน</button>` : ""}
              </div>

              <div class="ph-person-banner">
                <img src="${esc(m.photo)}" alt="${esc(m.nickname)}" />
                <div>
                  <div style="font-size:12px;font-weight:800;color:#2563eb">${esc(isSelf ? "🌟 การ์ดของคุณเอง!" : `KUCHI GANG · ${m.nickname}`)}</div>
                  <div style="font-size:18px;font-weight:800;color:#0f172a">${esc(m.mentiName)}</div>
                  <div style="font-size:12.5px;color:#64748b">${esc(m.fullName)}</div>
                </div>
              </div>

              <h1 class="ph-big-question" style="font-size:18px">
                คิดว่าภาพรวม Word Cloud บนจอใหญ่สะท้อนตัวตนจริงของ <span class="zm-highlight-name">'${esc(m.mentiName)}'</span> ได้ตรงแค่ไหน?
              </h1>

              <form data-form="phone-send-rating" data-target-id="${esc(m.uid)}" style="display:flex;flex-direction:column;gap:14px">
                <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:18px;padding:16px;text-align:center">
                  <div id="phRatingReadout" style="font-size:34px;font-weight:900;color:#2563eb;line-height:1">${currentVal.toFixed(1)} <span style="font-size:16px;color:#64748b">/ 5.0</span></div>
                  <input
                    type="range"
                    id="phRatingSlider"
                    name="score"
                    min="1"
                    max="5"
                    step="0.5"
                    value="${currentVal}"
                    style="width:100%;margin:14px 0 8px;accent-color:#2563eb;height:28px;cursor:pointer"
                  />
                  <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#64748b">
                    <span>1 · ไม่ตรงเลย</span>
                    <span>3 · ปานกลาง</span>
                    <span>5 · ตรงที่สุด!</span>
                  </div>
                </div>

                <input
                  type="text"
                  id="phReasonInput"
                  name="reason"
                  class="ph-answer-input"
                  placeholder="เหตุผลสั้นๆ เพิ่มเติม (ไม่บังคับ)..."
                  maxlength="120"
                  value="${esc(myPrevRating ? myPrevRating.reason || "" : "")}"
                />

                <button type="submit" class="ph-submit-btn">
                  ${myPrevRating ? "🔄 อัปเดตคะแนนขึ้นจอใหญ่" : "⭐ ส่งคะแนนขึ้นจอใหญ่!"}
                </button>
              </form>
            </section>
          </main>
        `
      );
    }

    // 3A. Full Type-Answer Controller on Phone (Default for Word Cloud)
    const showSubmittedCard = state.phoneJustSubmittedTargetId === tObj.id;

    return (
      topBar +
      `
        <main class="ph-shell">
          <section class="ph-card">
            <div class="ph-sync-banner">
              <span>✍️ Full Type-Answer · ส่งคำตอบเพื่อดูผลบนจอใหญ่พร้อมกัน</span>
              ${state.phoneManualOverride ? `<button type="button" class="tv-pill-btn" style="height:26px;font-size:11.5px" data-act="phone-manual-back-list">เปลี่ยนคน</button>` : ""}
            </div>

            <div class="ph-person-banner">
              ${
                m
                  ? `<img src="${esc(m.photo)}" alt="${esc(m.nickname)}" />`
                  : `<div style="width:58px;height:58px;border-radius:16px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">🚂</div>`
              }
              <div style="min-width:0">
                <div style="font-size:11.5px;font-weight:800;color:#2563eb">
                  ${esc(m ? (m.kind === "student" ? `KUCHI GANG #${m.studentNo}/20 · DISC ${m.disc}` : m.roleBadge) : "10–19 ธ.ค. 2569 · จ.กาฬสินธุ์")}
                </div>
                <div style="font-size:19px;font-weight:800;color:#0f172a;line-height:1.15">${esc(tObj.shortTitle)}</div>
                ${m ? `<div style="font-size:12.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.fullName)}</div>` : ""}
              </div>
            </div>

            <h1 class="ph-big-question">${bigQuestionHtml}</h1>

            ${
              showSubmittedCard
                ? `
                  <div class="ph-standby-box" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:20px;padding:22px 16px">
                    <div style="font-size:38px;line-height:1">🎉</div>
                    <strong style="font-size:19px;color:#14532d">ส่งคำตอบขึ้นจอใหญ่แล้ว!</strong>
                    <p style="margin:0;font-size:14px;color:#166534">👀 เงยหน้าดูผล <strong>Live Word Cloud</strong> บนจอใหญ่พร้อมกับเพื่อนๆ ได้เลย!</p>
                    ${
                      mySentWords.length
                        ? `
                          <div style="margin-top:6px">
                            <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px">คำที่คุณส่งให้ '${esc(tObj.shortTitle)}' แล้ว:</div>
                            <div class="ph-sent-chips">
                              ${mySentWords.map((w) => `<span class="ph-sent-chip">${esc(w)}</span>`).join("")}
                            </div>
                          </div>
                        `
                        : ""
                    }
                    <button type="button" class="ph-submit-btn" style="margin-top:10px" data-act="phone-more-words">
                      ➕ ส่งคำหรือประโยคเพิ่มอีก
                    </button>
                  </div>
                `
                : `
                  <form data-form="phone-send-words" data-target-id="${esc(tObj.id)}" style="display:flex;flex-direction:column;gap:12px">
                    <div class="ph-inputs-stack">
                      <div>
                        <div class="ph-input-label"><span>คำหรือประโยคที่ 1 *</span><span>สูงสุด 54 ตัวอักษร</span></div>
                        <input
                          type="text"
                          id="phW1"
                          name="w1"
                          class="ph-answer-input"
                          autocomplete="off"
                          placeholder="พิมพ์คำ หรือประโยคสะท้อนตัวตน..."
                          maxlength="54"
                        />
                      </div>
                      <div>
                        <div class="ph-input-label"><span>คำหรือประโยคที่ 2 (ถ้ามี)</span></div>
                        <input
                          type="text"
                          id="phW2"
                          name="w2"
                          class="ph-answer-input"
                          autocomplete="off"
                          placeholder="เพิ่มคำที่ 2 (ไม่บังคับ)..."
                          maxlength="54"
                        />
                      </div>
                      <div>
                        <div class="ph-input-label"><span>คำหรือประโยคที่ 3 (ถ้ามี)</span></div>
                        <input
                          type="text"
                          id="phW3"
                          name="w3"
                          class="ph-answer-input"
                          autocomplete="off"
                          placeholder="เพิ่มคำที่ 3 หรือเลือกอิโมจิด้านล่าง..."
                          maxlength="54"
                        />
                      </div>
                    </div>

                    <div class="zm-emoji-bar">
                      ${QUICK_EMOJIS.map((em) => `<button type="button" class="zm-emoji-btn" data-act="phone-emoji" data-emoji="${em}">${em}</button>`).join("")}
                    </div>

                    <button type="submit" class="ph-submit-btn">🚀 ส่งคำตอบขึ้นจอใหญ่!</button>

                    ${
                      mySentWords.length
                        ? `
                          <div style="text-align:center;padding-top:4px">
                            <span style="font-size:12px;color:#64748b;font-weight:700">ส่งไปแล้ว ${mySentWords.length} คำ: ${esc(mySentWords.join(" · "))}</span>
                          </div>
                        `
                        : ""
                    }
                  </form>
                `
            }
          </section>
        </main>
      `
    );
  }

  /* --- F. Modals (NO stopPropagation! Clean Backdrop Detection) --- */
  function renderModalNavHeaderHtml(titleHtml, extraRightHtml) {
    return `
      <div class="tv-modal-nav-header">
        ${renderUniversalNavClusterHtml(true)}
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${extraRightHtml || ""}
          <button type="button" class="tv-pill-btn" data-act="close-modals">✕ ปิด</button>
        </div>
      </div>
      ${titleHtml ? `<div style="margin-bottom:12px">${titleHtml}</div>` : ""}
    `;
  }

  function renderModalsHtml() {
    if (state.role === "participant") return "";
    let html = "";

    // 1. QR Instructions Modal
    if (state.qrModalOpen) {
      const joinUrl = getJoinUrl();
      const online = Array.from(state.presence.values());
      html += `
        <div class="tv-modal-backdrop">
          <div class="tv-modal-card" style="max-width:560px;text-align:center">
            ${renderModalNavHeaderHtml(
              `<h2 style="margin:0 0 4px;font-size:24px;font-weight:800">📱 สแกนเข้าโหมดผู้ตอบ (Full Type-Answer)</h2><p style="margin:0;font-size:14px;color:#64748b">มือถือที่สแกนจะวิ่งเปลี่ยนโจทย์ตามจอ Facilitator พร้อมกันอัตโนมัติ</p>`
            )}
            <div class="tv-qr-box">
              ${buildQrSvg(joinUrl)}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin:16px 0;padding:8px 12px;border-radius:12px;background:#f8fafc;border:1px solid #cbd5e1;font-family:var(--font-mono);font-size:12px;color:#1d4ed8;word-break:break-all">
              <span style="flex:1;text-align:left">${esc(joinUrl)}</span>
              <button type="button" class="tv-pill-btn" data-act="copy-url">คัดลอก</button>
            </div>
            ${
              online.length
                ? `<div style="font-size:13px;color:#166534;font-weight:700;margin-bottom:14px">👥 เช็คอินในห้องแล้ว ${online.length} เครื่อง: ${esc(online.map((p) => p.nick).join(", "))}</div>`
                : ""
            }
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${
                state.role !== "facilitator"
                  ? `<a class="tv-pill-btn is-facilitator" style="flex:1;height:42px" href="${esc(getFacilitatorUrl())}">🎛️ สลับจอนี้เป็น Facilitator จอใหญ่</a>`
                  : ""
              }
              <button type="button" class="tv-pill-btn is-primary" style="flex:1;height:42px" data-act="close-modals">พร้อมลุยต่อ!</button>
            </div>
          </div>
        </div>
      `;
    }

    // 2. Identity Picker Modal (21 Members — Zero stopPropagation, 100% Clickable!)
    if (state.identityModalOpen) {
      html += `
        <div class="tv-modal-backdrop">
          <div class="tv-modal-card">
            ${renderModalNavHeaderHtml(
              `<h3 style="margin:0 0 4px;font-size:21px;font-weight:800">เลือกชื่อของคุณในกลุ่มกุฉินารายณ์ 👋</h3><p style="margin:0;font-size:14px;color:#64748b">แตะรูปตัวเองครั้งเดียว ระบบจำชื่ออัตโนมัติและซิงค์เข้าห้องสดทันที (21 คน)</p>`
            )}
            ${renderIdentityGridCardsHtml()}
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
        <div class="tv-modal-backdrop">
          <div class="tv-modal-card">
            ${renderModalNavHeaderHtml(
              `<h3 style="margin:0;font-size:20px;font-weight:800">📊 ความถี่คำสะท้อน — ${esc(tObj ? tObj.shortTitle : "")} (${agg.totalSubmissions} คำ)</h3>`,
              `<button type="button" class="tv-pill-btn" style="color:#dc2626;border-color:#fecaca" data-act="clear-target" data-target-id="${esc(tid)}">🗑️ ล้างสไลด์นี้</button>`
            )}
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
        <div class="tv-modal-backdrop">
          <div class="tv-modal-card">
            ${renderModalNavHeaderHtml(
              `<h3 style="margin:0;font-size:20px;font-weight:800">🚂 เส้นทางกลุ่มที่ 1: รพร.กุฉินารายณ์ จ.กาฬสินธุ์</h3>`,
              `<a class="tv-pill-btn is-primary" href="${esc(DATA.meta.icsPath)}" download="RACM303_2569_Group1_Kuchinarai.ics">📅 ปฏิทิน .ics</a>`
            )}
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
    const label = state.role === "participant" ? (state.connectedCount > 0 ? "ซิงค์จอใหญ่" : "กำลังเชื่อม...") : state.connectedCount > 0 ? "Live Sync" : "Local";
    el.innerHTML = `<span class="tv-live-dot"></span><span>${label}</span>`;
  }

  /* Re-render without losing text currently typed inside ANY input box! */
  function renderPreservingFocus() {
    const preserveIds = ["zmWordInput", "phW1", "phW2", "phW3", "phReasonInput"];
    const savedValues = {};
    preserveIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) savedValues[id] = el.value;
    });

    const activeEl = document.activeElement;
    const activeId = activeEl && activeEl.id && preserveIds.includes(activeEl.id) ? activeEl.id : "";
    const selStart = activeId ? activeEl.selectionStart : null;

    render();

    Object.keys(savedValues).forEach((id) => {
      const nextEl = document.getElementById(id);
      if (nextEl && savedValues[id]) nextEl.value = savedValues[id];
    });

    if (activeId) {
      const focusTarget = document.getElementById(activeId);
      if (focusTarget) {
        focusTarget.focus();
        try {
          if (selStart !== null) focusTarget.setSelectionRange(selStart, selStart);
        } catch (_) {}
      }
    }
  }

  function render() {
    const root = document.getElementById("appRoot");
    if (!root) return;

    root.classList.toggle("is-bigscreen-fit", state.role !== "participant");

    if (state.role === "participant") {
      root.innerHTML = renderParticipantPhoneHtml();
      return;
    }

    const stageHtml =
      state.view === "lobby"
        ? renderFacilitatorLobbyHtml()
        : state.view === "detail"
        ? renderZoomedDetailHtml()
        : renderOverviewHtml();

    root.innerHTML = renderTopBarHtml() + stageHtml + renderModalsHtml();
  }

  /* ---------- 12. Event Delegation (Zero stopPropagation — 100% Reliable Clicks!) ---------- */
  document.addEventListener("focusin", (ev) => {
    const id = ev.target && ev.target.id;
    if (id === "phW1" || id === "phW2" || id === "phW3") {
      state.activeEmojiInputId = id;
    }
  });

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t && t.id === "phRatingSlider") {
      const v = Number(t.value || 4.5);
      state.phoneDraftRating = v;
      const ro = document.getElementById("phRatingReadout");
      if (ro) ro.innerHTML = `${v.toFixed(1)} <span style="font-size:16px;color:#64748b">/ 5.0</span>`;
    }
  });

  document.addEventListener("click", (ev) => {
    // Clean backdrop-only close (replaces broken stopPropagation!)
    if (ev.target && ev.target.classList && ev.target.classList.contains("tv-modal-backdrop")) {
      clearAllModals();
      render();
      return;
    }

    const btn = ev.target && ev.target.closest ? ev.target.closest("[data-act]") : null;
    if (!btn) return;
    const act = btn.getAttribute("data-act");

    if (act === "nav-back") {
      stepBackOneScreen();
    } else if (act === "go-lobby") {
      goToLobbySlide1(false);
    } else if (act === "zoom-in-target") {
      const tid = btn.getAttribute("data-target-id");
      const gIdx = Number(btn.getAttribute("data-grid-idx"));
      if (Number.isFinite(gIdx)) state.dpadIndex = gIdx;
      zoomIntoTarget(tid, btn, false, false);
    } else if (act === "go-overview") {
      zoomOutToOverview(false, false);
    } else if (act === "spin-roulette") {
      spinAppleTvRoulette();
    } else if (act === "prev-person") {
      stepZoomedTarget(-1);
    } else if (act === "next-person") {
      stepZoomedTarget(1);
    } else if (act === "set-detail-tab") {
      const nextTab = btn.getAttribute("data-tab") || "wordcloud";
      if (nextTab !== state.detailTab) pushNavHistory();
      state.detailTab = nextTab;
      broadcastMasterPointer(false);
      render();
    } else if (act === "toggle-hide-words") {
      state.hideWordsUntilReveal = !state.hideWordsUntilReveal;
      broadcastMasterPointer(false);
      render();
    } else if (act === "toggle-stage-composer") {
      state.showComposerOnStage = !state.showComposerOnStage;
      render();
    } else if (act === "open-qr") {
      if (!state.qrModalOpen) pushNavHistory();
      clearAllModals();
      state.qrModalOpen = true;
      render();
    } else if (act === "open-identity") {
      if (!state.identityModalOpen) pushNavHistory();
      clearAllModals();
      state.identityModalOpen = true;
      render();
    } else if (act === "open-roadmap") {
      if (!state.roadmapModalOpen) pushNavHistory();
      clearAllModals();
      state.roadmapModalOpen = true;
      render();
    } else if (act === "open-results") {
      const nextResId = btn.getAttribute("data-target-id") || "";
      if (state.resultsModalTargetId !== nextResId) pushNavHistory();
      clearAllModals();
      state.resultsModalTargetId = nextResId;
      render();
    } else if (act === "close-modals") {
      clearAllModals();
      render();
    } else if (act === "select-identity") {
      const uid = btn.getAttribute("data-uid") || "";
      if (!MEMBER_MAP.has(uid)) return;
      state.myMemberUid = uid;
      state.myGuestName = "";
      sSet("kuchi2569_my_uid", uid);
      sSet("kuchi2569_guest_name", "");
      state.identityModalOpen = false;
      state.phonePickingIdentity = false;
      playChime([523.25, 659.25, 783.99], 0.09, "triangle", 0.05);
      publishMyPresence();
      render();
    } else if (act === "phone-pick-name") {
      state.phonePickingIdentity = true;
      render();
    } else if (act === "phone-cancel-pick") {
      state.phonePickingIdentity = false;
      render();
    } else if (act === "phone-more-words") {
      state.phoneJustSubmittedTargetId = "";
      render();
      setTimeout(() => {
        const w1 = document.getElementById("phW1");
        if (w1) w1.focus();
      }, 40);
    } else if (act === "phone-enable-manual") {
      state.phoneManualOverride = true;
      render();
    } else if (act === "phone-disable-manual") {
      state.phoneManualOverride = false;
      render();
    } else if (act === "phone-manual-target") {
      const tid = btn.getAttribute("data-target-id") || "m_smart";
      state.activeTargetId = tid;
      state.view = "detail";
      state.detailTab = "wordcloud";
      state.phoneJustSubmittedTargetId = "";
      render();
    } else if (act === "phone-manual-back-list") {
      state.view = "overview";
      render();
    } else if (act === "phone-emoji") {
      const em = btn.getAttribute("data-emoji") || "";
      const ids = ["phW1", "phW2", "phW3"];
      let targetInput = document.getElementById(state.activeEmojiInputId);
      if (!targetInput || targetInput.value.trim().length > 46) {
        targetInput = ids.map((id) => document.getElementById(id)).find((el) => el && !el.value.trim()) || document.getElementById("phW1");
      }
      if (targetInput) {
        targetInput.value = (targetInput.value ? targetInput.value + " " : "") + em;
        targetInput.focus();
      }
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
        publishPacket(`${state.sessionId}/word_delete`, { type: "word_delete", targetId: tid, normKey: norm }, false);
        scheduleSnapshotPublish();
        render();
      }
    } else if (act === "clear-target") {
      const tid = btn.getAttribute("data-target-id");
      if (tid) {
        state.wordsByTarget.delete(tid);
        state.ratingsByTarget.delete(tid);
        saveSessionStore();
        publishPacket(`${state.sessionId}/clear_target`, { type: "clear_target", targetId: tid }, false);
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
      broadcastMasterPointer(false);
      scheduleSnapshotPublish();
      render();
    }
  });

  document.addEventListener("submit", (ev) => {
    const form = ev.target;
    if (!form || !form.getAttribute) return;
    const fType = form.getAttribute("data-form");

    if (fType === "send-word") {
      ev.preventDefault();
      const tid = form.getAttribute("data-target-id");
      const inp = form.elements.word;
      if (inp && submitWordBatch(tid, [inp.value])) {
        inp.value = "";
      }
    } else if (fType === "phone-send-words") {
      ev.preventDefault();
      const tid = form.getAttribute("data-target-id");
      const vals = [
        form.elements.w1 ? form.elements.w1.value : "",
        form.elements.w2 ? form.elements.w2.value : "",
        form.elements.w3 ? form.elements.w3.value : ""
      ].filter((v) => String(v || "").trim().length > 0);

      if (!vals.length) {
        const w1 = document.getElementById("phW1");
        if (w1) w1.focus();
        return;
      }
      if (submitWordBatch(tid, vals)) {
        state.phoneJustSubmittedTargetId = tid;
        render();
      }
    } else if (fType === "phone-send-rating") {
      ev.preventDefault();
      const tid = form.getAttribute("data-target-id");
      const sc = form.elements.score ? Number(form.elements.score.value) : state.phoneDraftRating;
      const rs = form.elements.reason ? form.elements.reason.value : "";
      submitRating(tid, sc, rs);
    } else if (fType === "guest-identity") {
      ev.preventDefault();
      const gName = String((form.elements.guestName && form.elements.guestName.value) || "").trim();
      if (!gName) return;
      state.myMemberUid = "";
      state.myGuestName = gName;
      sSet("kuchi2569_my_uid", "");
      sSet("kuchi2569_guest_name", gName);
      state.phonePickingIdentity = false;
      publishMyPresence();
      render();
    }
  });

  /* Apple TV D-Pad & Facilitator Keyboard Shortcuts */
  document.addEventListener("keydown", (ev) => {
    if (state.role === "participant") return;
    const tag = (ev.target && ev.target.tagName) || "";
    const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if (ev.key === "Escape") {
      if (isTyping) {
        ev.target.blur();
        return;
      }
      if (hasAnyOpenModal()) {
        clearAllModals();
        render();
        return;
      }
      if (state.view === "detail") {
        ev.preventDefault();
        zoomOutToOverview(false, false);
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

    if (state.view === "lobby") {
      if (ev.key === "ArrowRight" || ev.key === "Enter" || ev.key === " " || ev.key === "PageDown") {
        ev.preventDefault();
        zoomOutToOverview(false, false);
      }
      return;
    }

    if (state.view === "overview") {
      const gridEl = document.getElementById("tvOverviewGrid");
      const totalTiles = MEMBERS.length; // 21 exact cards
      let cols = 7;
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
        stepBackOneScreen();
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
      if (state.role === "participant") return;
      if (state.view !== "detail" || state.detailTab !== "wordcloud") return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderPreservingFocus(), 180);
    },
    { passive: true }
  );

  render();
  initTransports();
})();
