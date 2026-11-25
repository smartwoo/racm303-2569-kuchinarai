/* ==========================================================================
   RACM 303 (2569) — Kuchi Gang 2569 Interactive Presentation & Live Menti App
   - Exact Mentimeter Sequence: Instructions QR -> Word Cloud -> 1-5 Rating Scale
   - 22-Member Photo Card Wall + 16:9 Animated Spotlight Roulette Ice-breaker
   - Real-Time Sync: MQTT over WSS + PeerJS WebRTC + BroadcastChannel + Storage
   ========================================================================== */
(function () {
  "use strict";

  const DATA = window.KUCHI_DATA || { meta: {}, members: [], sessions: [], roadmap: [], objectives5: [] };
  const MEMBERS = DATA.members || [];
  const MEMBER_MAP = new Map(MEMBERS.map((m) => [m.uid, m]));

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
    "#db2777"  // Pink
  ];

  const QUICK_EMOJIS = ["🙏", "🔥", "💅", "🦕", "🤖", "💯", "🥰", "😎", "🩺", "🎸", "🍜", "😴", "🧗‍♀️", "✌️"];

  /* ---------- 1. Build Full Slide Sequence ---------- */
  function buildSlides() {
    const list = [
      {
        id: "s_cover",
        kind: "cover",
        navLabel: "01 · หน้าปก Kuchi Gang 2569"
      },
      {
        id: "s_qr",
        kind: "qr",
        navLabel: "02 · Instructions & QR Code เข้าห้องสด"
      },
      {
        id: "s_roster",
        kind: "roster",
        navLabel: "03 · การ์ดรูปถ่าย 22 คน & สุ่มแนะนำตัว 16:9"
      }
    ];

    MEMBERS.forEach((m, idx) => {
      const tag = m.kind === "student" ? `นศพ. #${m.studentNo}` : m.roleBadge.split("·")[0].trim();
      list.push({
        id: `wc_${m.uid}`,
        kind: "wordcloud",
        targetId: m.uid,
        member: m,
        promptHtml: `หากต้องแนะนำ <strong>'${esc(m.mentiName)}'</strong> ให้ผู้อื่นรู้จักในระยะเวลาอันสั้น คุณจะใช้คำหรือประโยคใดที่บ่งบอกความเป็นตัวตนได้มากที่สุด?`,
        navLabel: `WC · ${m.nickname} (${tag})`
      });
      list.push({
        id: `rt_${m.uid}`,
        kind: "rating",
        targetId: m.uid,
        member: m,
        wcTargetId: `wc_${m.uid}`,
        promptHtml: `ถ้าให้ <strong>'${esc(m.mentiName)}'</strong> ให้คะแนนกับ Word Cloud ที่เพื่อนๆ สะท้อนมา คิดว่าตรงกับตัวตนที่แท้จริงมากน้อยแค่ไหน? และทำไมถึงให้คะแนนเช่นนั้น?`,
        navLabel: `   ↳ คะแนน 1–5 · ${m.nickname}`
      });
    });

    list.push(
      {
        id: "wc_kuchinarai_expect",
        kind: "wordcloud",
        targetId: "topic_kuchinarai_expect",
        member: null,
        promptHtml: `เมื่อพูดถึง <strong>'ทริปรถไฟ & รพร.กุฉินารายณ์ จ.กาฬสินธุ์ (10–19 ธ.ค. 69)'</strong> คำหรือความคาดหวังแรกที่ผุดขึ้นมาในใจคุณคืออะไร?`,
        navLabel: "WC · ความคาดหวังต่อทริป รพร.กุฉินารายณ์"
      },
      {
        id: "s_roadmap",
        kind: "roadmap",
        navLabel: "สรุปเส้นทางกลุ่มกุฉินารายณ์ (SG1 → รถไฟ 10–19 ธ.ค. → 3A/4A)"
      },
      {
        id: "s_objectives",
        kind: "objectives",
        navLabel: "5 วัตถุประสงค์ภาคสนาม & กติกาความปลอดภัย"
      },
      {
        id: "s_yearbook",
        kind: "yearbook",
        navLabel: "สมุดรวมคำสะท้อน Kuchi Gang 2569 (Print / Save PDF)"
      }
    );

    return list;
  }

  const SLIDES = buildSlides();

  /* ---------- 2. Helpers & Safe Storage ---------- */
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

  function isJoinHash() {
    const h = (window.location.hash || "").toLowerCase();
    const p = new URLSearchParams(window.location.search);
    return h.startsWith("#join") || h.startsWith("#live") || p.get("mode") === "join";
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

  /* ---------- 3. Pure-JS ISO/IEC 18004 QR Code SVG Generator (Versions 1..10, ECC-M) ---------- */
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

  /* ---------- 4. Lightweight Web Audio Chimes ---------- */
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
        const t0 = audioCtx.currentTime + idx * (durSec * 0.55);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + durSec + 0.03);
      });
    } catch (_) {}
  }

  /* ---------- 5. Application State ---------- */
  const cliId = randId("cli");
  const persistentPid = (function () {
    let p = sGet("kuchi2569_pid", "");
    if (!p) {
      p = randId("p");
      sSet("kuchi2569_pid", p);
    }
    return p;
  })();

  const state = {
    mode: isJoinHash() ? "participant" : "presenter",
    sessionId: sGet("kuchi2569_session", "sg1_intro"),
    slideIdx: Number(sGet("kuchi2569_slide_idx", "0")) || 0,
    pointerSeq: 0,
    skipRatingSlides: sGet("kuchi2569_skip_rating", "0") === "1",
    hideWordsUntilReveal: false,
    rouletteIncludeMentors: sGet("kuchi2569_roul_mentors", "1") !== "0",
    rouletteSpinning: false,
    rouletteHighlightUid: "",
    pickedUids: new Set(),
    muted: sGet("kuchi2569_muted", "0") === "1",

    // Participant identity
    myMemberUid: sGet("kuchi2569_my_uid", ""),
    myGuestName: sGet("kuchi2569_guest_name", ""),
    followHost: true,

    // Live synced data for active sessionId:
    // wordsByTarget: Map<targetId, Map<subId, { subId, text, pid, memberUid, nick, ts }>>
    wordsByTarget: new Map(),
    // ratingsByTarget: Map<targetId, Map<pid, { pid, memberUid, nick, score, reason, isOwner, ts }>>
    ratingsByTarget: new Map(),
    // presence: Map<pid, { pid, memberUid, nick, photo, ts }>
    presence: new Map(),

    // Modals
    spotlightMember: null,
    qrModalOpen: false,
    resultsModalTargetId: "",

    // Transports
    mqttClients: [],
    bc: null,
    peer: null,
    peerConns: new Map(),
    hostConn: null,
    connectedCount: 0
  };

  if (state.slideIdx < 0 || state.slideIdx >= SLIDES.length) state.slideIdx = 0;

  /* ---------- 6. Local Persistence per Session ---------- */
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
      const pickedArr = Array.from(state.pickedUids);
      sSet(storageKeyForSession(state.sessionId), JSON.stringify({ words: wordsObj, ratings: ratingsObj, picked: pickedArr }));
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
    if (state.mode === "presenter") {
      state.peerConns.forEach((c) => {
        try {
          if (c && c.open) c.send(env);
        } catch (_) {}
      });
    } else if (state.hostConn && state.hostConn.open) {
      try {
        state.hostConn.send(env);
      } catch (_) {}
    }
  }

  let snapshotDebounceTimer = 0;
  function scheduleHostSnapshotPublish() {
    if (state.mode !== "presenter") return;
    if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);
    snapshotDebounceTimer = setTimeout(() => {
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
          slideIdx: state.slideIdx,
          pointerSeq: state.pointerSeq,
          words: wordsCompact,
          ratings: ratingsCompact,
          picked: Array.from(state.pickedUids)
        },
        true
      );
    }, 380);
  }

  function broadcastPointer() {
    if (state.mode !== "presenter") return;
    state.pointerSeq += 1;
    publishPacket(
      "pointer",
      {
        type: "pointer",
        slideIdx: state.slideIdx,
        pointerSeq: state.pointerSeq
      },
      true
    );
  }

  function publishMyPresence() {
    const mem = MEMBER_MAP.get(state.myMemberUid);
    const nick = mem ? mem.nickname : state.myGuestName || "";
    if (!nick && state.mode === "participant") return;
    const rec = {
      pid: persistentPid,
      memberUid: mem ? mem.uid : "",
      nick: nick || "Presenter",
      photo: mem ? mem.photo : "",
      ts: Date.now()
    };
    if (nick) state.presence.set(persistentPid, rec);
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
      if (state.mode === "participant" && (msg.type === "pointer" || msg.type === "snapshot") && !isRetained) {
        state.sessionId = msg.sessionId;
        sSet("kuchi2569_session", state.sessionId);
        loadSessionStore(state.sessionId);
      } else {
        return;
      }
    }

    if (state.mode === "presenter" && state.peerConns.size > 0 && !isRetained) {
      state.peerConns.forEach((c) => {
        try {
          if (c && c.open) c.send({ subtopic, msg });
        } catch (_) {}
      });
    }

    if (msg.type === "pointer") {
      const idx = Number(msg.slideIdx);
      if (Number.isFinite(idx) && idx >= 0 && idx < SLIDES.length) {
        if (state.mode === "participant" && state.followHost) {
          state.slideIdx = idx;
          render();
        }
      }
      return;
    }

    if (msg.type === "snapshot") {
      const changed = mergeSnapshot(msg);
      if (state.mode === "participant" && state.followHost && Number.isFinite(Number(msg.slideIdx))) {
        const idx = Number(msg.slideIdx);
        if (idx >= 0 && idx < SLIDES.length) state.slideIdx = idx;
      }
      if (changed || state.mode === "participant") render();
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
        if (state.mode === "presenter" && !isRetained) {
          const curSlide = SLIDES[state.slideIdx];
          if (curSlide && curSlide.targetId === tid) {
            playChime([587.33, 880], 0.11, "sine", 0.05);
          }
          scheduleHostSnapshotPublish();
        }
        render();
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
      render();
      return;
    }

    if (msg.type === "clear_target") {
      const tid = String(msg.targetId || "");
      if (tid) {
        state.wordsByTarget.delete(tid);
        state.ratingsByTarget.delete(tid);
        saveSessionStore();
        render();
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
      if (state.mode === "presenter" && !isRetained) {
        playChime([523.25, 659.25], 0.1, "triangle", 0.05);
        scheduleHostSnapshotPublish();
      }
      render();
      return;
    }

    if (msg.type === "presence") {
      if (msg.pid && msg.nick) {
        const isNew = !state.presence.has(msg.pid);
        state.presence.set(msg.pid, {
          pid: msg.pid,
          memberUid: msg.memberUid || "",
          nick: msg.nick,
          photo: msg.photo || "",
          ts: Date.now()
        });
        if (isNew && state.mode === "presenter" && !isRetained) {
          playChime([659.25, 987.77], 0.09, "sine", 0.045);
          broadcastPointer();
          scheduleHostSnapshotPublish();
        }
        render();
      }
      return;
    }

    if (msg.type === "hello_request" && state.mode === "presenter" && !isRetained) {
      broadcastPointer();
      scheduleHostSnapshotPublish();
    }
  }

  function subscribeCurrentSessionTopics(client) {
    try {
      client.subscribe(`${TOPIC_ROOT}/+/+`, { qos: 0 });
    } catch (_) {}
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
        render();
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
            subscribeCurrentSessionTopics(cl);
            if (state.mode === "presenter") {
              broadcastPointer();
              scheduleHostSnapshotPublish();
            } else {
              publishMyPresence();
              publishPacket("hello", { type: "hello_request" }, false);
            }
            updateConnectionBadge();
          });
          cl.on("close", () => {
            state.connectedCount = Math.max(0, state.connectedCount - 1);
            updateConnectionBadge();
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

    if (window.Peer) {
      try {
        const hostPeerId = `racm303-2569-kuchi-host-${state.sessionId}`;
        if (state.mode === "presenter") {
          const peer = new window.Peer(hostPeerId);
          peer.on("connection", (conn) => {
            state.peerConns.set(conn.peer, conn);
            conn.on("open", () => {
              conn.send({
                subtopic: "pointer",
                msg: { type: "pointer", msgId: randId("m"), senderCli: cliId, sessionId: state.sessionId, slideIdx: state.slideIdx }
              });
              scheduleHostSnapshotPublish();
            });
            conn.on("data", (env) => {
              if (env && env.msg) handleIncoming(env.subtopic, env.msg, false);
            });
            conn.on("close", () => state.peerConns.delete(conn.peer));
          });
          state.peer = peer;
        } else {
          const peer = new window.Peer();
          peer.on("open", () => {
            const conn = peer.connect(hostPeerId, { reliable: true });
            state.hostConn = conn;
            conn.on("open", () => {
              publishMyPresence();
              publishPacket("hello", { type: "hello_request" }, false);
            });
            conn.on("data", (env) => {
              if (env && env.msg) handleIncoming(env.subtopic, env.msg, false);
            });
          });
          state.peer = peer;
        }
      } catch (_) {}
    }

    setInterval(() => {
      if (state.mode === "participant" && (state.myMemberUid || state.myGuestName)) {
        publishMyPresence();
      }
    }, 25000);
  }

  /* ---------- 8. Word Cloud Aggregation & Spiral Non-Overlapping Layout ---------- */
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

  function computeWordCloudPositions(items) {
    if (!items.length) return [];
    const W = 1000;
    const H = 520;
    const cx = W / 2;
    const cy = H / 2;
    const maxCount = Math.max(1, ...items.map((x) => x.count));
    const placed = [];

    return items.slice(0, 48).map((item, idx) => {
      const ratio = maxCount === 1 ? (idx === 0 ? 0.85 : 0.42) : (item.count - 1) / Math.max(1, maxCount - 1);
      let fontPx = Math.round(22 + ratio * 46);
      if (items.length > 24) fontPx = Math.round(fontPx * 0.86);
      if (item.emojiOnly) fontPx = Math.round(fontPx * 1.32);

      const charUnit = item.emojiOnly ? fontPx * 1.15 : fontPx * 0.56;
      const boxW = Math.max(fontPx * 1.2, item.text.length * charUnit + 26);
      const boxH = fontPx * 1.28 + 8;

      let bestX = cx;
      let bestY = cy;
      for (let step = 0; step < 520; step += 1) {
        const angle = step * 0.42 + idx * 0.85;
        const radius = step * 3.1;
        const tx = cx + Math.cos(angle) * radius * 1.48;
        const ty = cy + Math.sin(angle) * radius * 0.84;

        if (tx - boxW / 2 < 18 || tx + boxW / 2 > W - 18 || ty - boxH / 2 < 16 || ty + boxH / 2 > H - 16) {
          continue;
        }
        let collides = false;
        for (let j = 0; j < placed.length; j += 1) {
          const p = placed[j];
          if (
            Math.abs(tx - p.x) * 2 < boxW + p.w &&
            Math.abs(ty - p.y) * 2 < boxH + p.h
          ) {
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
        fontVmin: Number((fontPx / 10.5).toFixed(2)),
        fontPx,
        color: MENTI_COLORS[idx % MENTI_COLORS.length]
      });
    });
  }

  /* ---------- 9. Actions: Add Word, Submit Rating, Spin 16:9 Roulette ---------- */
  function submitWord(targetId, rawText, authorInfo) {
    const cleaned = String(rawText || "").trim().replace(/\s+/g, " ").slice(0, 52);
    if (!cleaned || !targetId) return false;

    const mem = MEMBER_MAP.get(state.myMemberUid);
    const entry = {
      subId: randId("w"),
      text: cleaned,
      pid: (authorInfo && authorInfo.pid) || persistentPid,
      memberUid: (authorInfo && authorInfo.memberUid) || (mem ? mem.uid : ""),
      nick: (authorInfo && authorInfo.nick) || (mem ? mem.nickname : state.myGuestName || "เพื่อนในกลุ่ม"),
      ts: Date.now()
    };

    if (!state.wordsByTarget.has(targetId)) state.wordsByTarget.set(targetId, new Map());
    state.wordsByTarget.get(targetId).set(entry.subId, entry);
    saveSessionStore();

    publishPacket("word_add", { type: "word_add", targetId, item: entry }, false);
    if (state.mode === "presenter") scheduleHostSnapshotPublish();
    playChime([659.25, 880], 0.09, "sine", 0.05);
    render();
    return true;
  }

  function submitRating(targetId, scoreVal, reasonText) {
    const score = Math.max(1, Math.min(5, Number(Number(scoreVal).toFixed(1))));
    if (!targetId || !Number.isFinite(score)) return;
    const mem = MEMBER_MAP.get(state.myMemberUid);
    const slide = SLIDES.find((s) => s.id === targetId || (s.kind === "rating" && s.targetId === targetId));
    const ownerUid = slide && slide.member ? slide.member.uid : targetId;
    const isOwner = Boolean(mem && mem.uid === ownerUid) || state.mode === "presenter";

    const rec = {
      pid: state.mode === "presenter" ? `owner_${ownerUid}` : persistentPid,
      memberUid: mem ? mem.uid : state.mode === "presenter" ? ownerUid : "",
      nick:
        state.mode === "presenter" && MEMBER_MAP.get(ownerUid)
          ? MEMBER_MAP.get(ownerUid).nickname
          : mem
          ? mem.nickname
          : state.myGuestName || "สมาชิกกลุ่ม",
      score,
      reason: String(reasonText || "").trim().slice(0, 140),
      isOwner,
      ts: Date.now()
    };

    if (!state.ratingsByTarget.has(targetId)) state.ratingsByTarget.set(targetId, new Map());
    state.ratingsByTarget.get(targetId).set(rec.pid, rec);
    saveSessionStore();

    publishPacket("rating_set", { type: "rating_set", targetId, record: rec }, false);
    if (state.mode === "presenter") scheduleHostSnapshotPublish();
    playChime([523.25, 659.25, 783.99], 0.11, "triangle", 0.06);
    render();
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
    scheduleHostSnapshotPublish();
    playChime([523.25, 659.25, 783.99, 1046.5], 0.12, "triangle", 0.06);
    render();
  }

  function goToSlide(idx) {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, idx));
    state.slideIdx = clamped;
    sSet("kuchi2569_slide_idx", String(clamped));
    const cur = SLIDES[clamped];
    if (cur && cur.member) {
      state.pickedUids.add(cur.member.uid);
      saveSessionStore();
    }
    broadcastPointer();
    render();
  }

  function stepSlide(delta) {
    let next = state.slideIdx + delta;
    while (
      state.skipRatingSlides &&
      next >= 0 &&
      next < SLIDES.length &&
      SLIDES[next].kind === "rating"
    ) {
      next += delta > 0 ? 1 : -1;
    }
    goToSlide(next);
  }

  function spinSpotlightRoulette() {
    if (state.rouletteSpinning) return;
    const rosterIdx = SLIDES.findIndex((s) => s.kind === "roster");
    if (state.slideIdx !== rosterIdx) {
      state.slideIdx = rosterIdx;
      sSet("kuchi2569_slide_idx", String(rosterIdx));
      broadcastPointer();
    }

    const poolAll = MEMBERS.filter((m) => state.rouletteIncludeMentors || m.kind === "student");
    let candidates = poolAll.filter((m) => !state.pickedUids.has(m.uid));
    if (candidates.length === 0) {
      state.pickedUids.clear();
      candidates = poolAll.slice();
    }

    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    state.rouletteSpinning = true;
    state.spotlightMember = null;
    render();

    const totalTicks = 22;
    let tick = 0;
    const stepTick = () => {
      if (tick < totalTicks) {
        const pick = candidates[tick % candidates.length] || poolAll[tick % poolAll.length];
        state.rouletteHighlightUid = pick.uid;
        playChime([380 + (tick % 6) * 45], 0.045, "sine", 0.04);
        updateRosterHighlightOnly();
        tick += 1;
        const delay = 55 + Math.pow(tick / totalTicks, 2.2) * 210;
        setTimeout(stepTick, delay);
      } else {
        state.rouletteSpinning = false;
        state.rouletteHighlightUid = winner.uid;
        state.pickedUids.add(winner.uid);
        state.spotlightMember = winner;
        saveSessionStore();
        scheduleHostSnapshotPublish();
        playChime([523.25, 659.25, 783.99, 1046.5], 0.16, "triangle", 0.08);
        render();
      }
    };
    stepTick();
  }

  function updateRosterHighlightOnly() {
    document.querySelectorAll("[data-person-uid]").forEach((el) => {
      el.classList.toggle("is-roulette-active", el.getAttribute("data-person-uid") === state.rouletteHighlightUid);
    });
  }

  /* ---------- 10. Render Presenter 16:9 UI ---------- */
  function renderMentiDecorHtml() {
    return `
      <div class="menti-decor" aria-hidden="true">
        <div class="menti-shape-blue-para"></div>
        <div class="menti-shape-pink-circle"></div>
        <div class="menti-shape-yellow-line"></div>
        <div class="menti-shape-yellow-tri"></div>
        <div class="menti-shape-mint-arc"></div>
        <div class="menti-shape-blue-line"></div>
        <div class="menti-shape-purple-tri"></div>
        <div class="menti-shape-mint-dot"></div>
      </div>
      <div class="menti-corner-brand">
        <svg class="menti-mark-svg" viewBox="0 0 36 28" aria-hidden="true">
          <polygon points="0,28 0,4 12,16 12,28" fill="#1e3a8a"/>
          <polygon points="0,28 12,16 22,28" fill="#fb7185"/>
          <rect x="15" y="8" width="7" height="20" fill="#2563eb"/>
          <rect x="25" y="0" width="8" height="28" fill="#0f172a"/>
        </svg>
        <span class="menti-mark-label">Kuchi</span>
        <span class="menti-mark-sub">รพร.กุฉินารายณ์ 69</span>
      </div>
    `;
  }

  function renderSlideInnerHtml(slide) {
    if (slide.kind === "cover") {
      const students = MEMBERS.filter((m) => m.kind === "student");
      const smart = MEMBER_MAP.get("m_smart");
      const fluke = MEMBER_MAP.get("m_fluke");
      return `
        <div class="kc-cover-grid">
          <div>
            <div class="kc-kicker">🏥 RACM 303 · ปีการศึกษา 2569 · กลุ่มพื้นที่ภาคสนามที่ 1</div>
            <h1 class="kc-cover-title">
              ครอบครัว <span>Kuchi Gang 2569</span><br/>
              รพร.กุฉินารายณ์ จ.กาฬสินธุ์
            </h1>
            <p class="kc-cover-sub">
              พื้นที่ทำความรู้จัก สะท้อนตัวตนแบบสด (Live Word Cloud &amp; Self-Reflection Scale)
              และการเตรียมทีมออกฝึกปฏิบัติงานภาคสนามร่วมกันตลอด 6 สัปดาห์
            </p>
            <div class="kc-meta-pills">
              <span class="kc-meta-chip">👨‍⚕️ อ. นพ.ณัฐวุฒิ (พี่สมาร์ท)</span>
              <span class="kc-meta-chip">🤝 คุณวิลาสิณี (พี่ฟลุ๊ค)</span>
              <span class="kc-meta-chip">🎓 นศพ. ปี 3 จำนวน 20 คน (ชาย 10 · หญิง 10)</span>
              <span class="kc-meta-chip">📍 ห้องประจำกลุ่ม: 3B1-01</span>
              <span class="kc-meta-chip">🚂 รถไฟเย็น พฤ. 10 – ส. 19 ธ.ค. 69 (9 คืน 10 วัน)</span>
            </div>
            <div class="kc-cta-row">
              <button type="button" class="kc-big-cta is-blue" data-act="goto-qr">📱 เริ่มสแกน QR เข้าห้องสด →</button>
              <button type="button" class="kc-big-cta is-pink" data-act="spin-roulette">🎲 เปิดการ์ด 20 คน &amp; สุ่มแนะนำตัว</button>
              <button type="button" class="kc-big-cta is-outline" data-act="goto-roadmap">🗺️ แผนเดินทาง &amp; ภารกิจ</button>
            </div>
          </div>

          <div class="kc-cover-right">
            <div class="kc-mentors-row">
              <div class="kc-mentor-card" data-open-member="m_smart" style="cursor:pointer">
                <img src="${esc(smart.photo)}" alt="${esc(smart.fullName)}" />
                <div class="kc-mentor-info">
                  <strong>พี่สมาร์ท (อ.ณัฐวุฒิ)</strong>
                  <span>อาจารย์ที่ปรึกษากลุ่ม</span>
                </div>
              </div>
              <div class="kc-mentor-card is-staff" data-open-member="m_fluke" style="cursor:pointer">
                <img src="${esc(fluke.photo)}" alt="${esc(fluke.fullName)}" />
                <div class="kc-mentor-info">
                  <strong>พี่ฟลุ๊ค (คุณวิลาสิณี)</strong>
                  <span>พี่ประสานงานกลุ่ม</span>
                </div>
              </div>
            </div>
            <div style="font-size:12.5px;font-weight:700;color:#334155;display:flex;justify-content:space-between">
              <span>สมาชิก นศพ. กลุ่มกุฉินารายณ์ทั้ง 20 คน</span>
              <span style="color:#2563eb;cursor:pointer" data-act="goto-roster">ดูการ์ดเต็มจอ ↗</span>
            </div>
            <div class="kc-mini-avatar-strip">
              ${students
                .map(
                  (s) => `<img src="${esc(s.photo)}" alt="${esc(s.nickname)}" title="${esc(s.nickname)} (${esc(s.fullName)})" data-open-member="${esc(s.uid)}" style="cursor:pointer" />`
                )
                .join("")}
            </div>
          </div>
        </div>
      `;
    }

    if (slide.kind === "qr") {
      const joinUrl = getJoinUrl();
      const onlineList = Array.from(state.presence.values());
      return `
        <div class="kc-qr-slide">
          <h1 class="kc-qr-heading">Instructions</h1>
          <p class="kc-qr-sub">สแกน QR Code ด้วยกล้องมือถือ / iPad เพื่อเลือกชื่อตัวเอง แล้วส่งคำสะท้อนเข้า Word Cloud สดพร้อมกัน</p>
          <div class="kc-qr-main-split">
            <div class="kc-qr-frame">
              ${buildQrSvg(joinUrl)}
              <div class="kc-qr-center-badge">KG</div>
            </div>
            <div class="kc-qr-checkin-panel">
              <div style="font-weight:800;font-size:15px;color:#0f172a">🔗 ลิงก์เข้าร่วมจากมือถือ / แท็บเล็ต:</div>
              <div class="kc-url-box">
                <span style="flex:1">${esc(joinUrl)}</span>
                <button type="button" class="kp-btn" data-act="copy-join-url">คัดลอก</button>
              </div>
              <div style="font-size:13px;font-weight:700;color:#334155">
                👥 เข้าห้องสดแล้ว <strong>${onlineList.length}</strong> คน:
              </div>
              <div class="kc-joined-chips">
                ${
                  onlineList.length
                    ? onlineList
                        .map(
                          (p) => `
                            <span class="kc-joined-chip">
                              ${p.photo ? `<img src="${esc(p.photo)}" alt="" />` : `<span>✨</span>`}
                              <span>${esc(p.nick)}</span>
                            </span>
                          `
                        )
                        .join("")
                    : `<span style="font-size:12.5px;color:#94a3b8">รอเพื่อนๆ สแกน QR Code เข้ามาเช็คอิน...</span>`
                }
              </div>
              <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
                <button type="button" class="kp-btn is-primary" data-act="next-slide">เริ่มสไลด์ถัดไป →</button>
                <button type="button" class="kp-btn is-roulette" data-act="spin-roulette">🎲 ไปหน้าสุ่มแนะนำตัว</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (slide.kind === "roster") {
      const onlineUids = new Set(Array.from(state.presence.values()).map((p) => p.memberUid).filter(Boolean));
      const totalPool = state.rouletteIncludeMentors ? MEMBERS.length : 20;
      const doneCount = MEMBERS.filter((m) => (state.rouletteIncludeMentors || m.kind === "student") && state.pickedUids.has(m.uid)).length;

      return `
        <div class="kc-roster-top">
          <div>
            <h2>การ์ดรูปถ่ายครอบครัวกุฉินารายณ์ (${doneCount}/${totalPool} แนะนำตัวแล้ว)</h2>
          </div>
          <div class="kc-roster-actions">
            <label style="font-size:12.5px;font-weight:700;color:#475569;display:inline-flex;align-items:center;gap:5px;cursor:pointer">
              <input type="checkbox" data-act="toggle-mentor-pool" ${state.rouletteIncludeMentors ? "checked" : ""} />
              รวมพี่สมาร์ท &amp; พี่ฟลุ๊คในการสุ่ม
            </label>
            <button type="button" class="kp-btn is-roulette" data-act="spin-roulette" ${state.rouletteSpinning ? "disabled" : ""}>
              🎲 ${state.rouletteSpinning ? "กำลังหมุนสุ่ม..." : "สุ่มแนะนำตัวคนถัดไป!"}
            </button>
            <button type="button" class="kp-btn" data-act="reset-picked">↺ รีเซ็ตคิวสุ่ม</button>
          </div>
        </div>

        <div class="kc-photo-wall">
          ${MEMBERS.map((m) => {
            const isPicked = state.pickedUids.has(m.uid);
            const isOnline = onlineUids.has(m.uid);
            const isHi = state.rouletteHighlightUid === m.uid;
            const badgeTop = m.kind === "student" ? `#${m.studentNo}` : m.kind === "advisor" ? "AJ" : "พี่ประสาน";
            const subLine = m.kind === "student" ? `${m.shortNo} · D${m.disc}${m.program === "MD-M.Eng" ? " · M.Eng" : ""}` : m.firstName;
            return `
              <div class="kc-person-card${isPicked ? " is-picked" : ""}${isHi ? " is-roulette-active" : ""}" data-person-uid="${esc(m.uid)}" data-open-member="${esc(m.uid)}" title="คลิกเพื่อเปิดการ์ดใหญ่ 16:9 หรือไปหน้า Word Cloud ของ ${esc(m.mentiName)}">
                <div class="kc-person-photo-wrap">
                  <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" loading="eager" />
                  <span class="kc-person-num">${esc(badgeTop)}</span>
                  ${isPicked ? `<span class="kc-person-done-badge" title="แนะนำตัวแล้ว">✓</span>` : ""}
                  ${isOnline ? `<span class="kc-person-online-dot" title="ออนไลน์ในห้องสด"></span>` : ""}
                </div>
                <div class="kc-person-meta">
                  <div class="kc-person-nick">${esc(m.nickname)}</div>
                  <div class="kc-person-sub">${esc(subLine)}</div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    if (slide.kind === "wordcloud") {
      const agg = getAggregatedWords(slide.targetId);
      const positioned = computeWordCloudPositions(agg.items);
      const m = slide.member;

      return `
        <div class="menti-prompt-header">
          <h2 class="menti-prompt-title">${slide.promptHtml}</h2>
          ${
            m
              ? `
                <div class="menti-person-floater" data-open-member="${esc(m.uid)}" title="คลิกเพื่อขยายการ์ดรูปถ่าย 16:9">
                  <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" />
                  <div class="menti-person-floater-txt">
                    <span class="menti-person-floater-nick">${esc(m.nickname)} · ${esc(m.firstName)}</span>
                    <span class="menti-person-floater-sub">${esc(m.kind === "student" ? `${m.id} · Disc ${m.disc}` : m.roleBadge)}</span>
                  </div>
                </div>
              `
              : ""
          }
        </div>

        <div class="menti-cloud-stage">
          ${
            state.hideWordsUntilReveal
              ? `
                <div class="menti-cloud-empty">
                  <strong>🙈 ซ่อนคำสะท้อนไว้ชั่วคราว (${agg.totalSubmissions} คำ จาก ${agg.uniqueRespondents} คน)</strong>
                  <p>รอให้เพื่อนๆ พิมพ์เสร็จ แล้วกดปุ่มเฉลยเพื่อเปิด Word Cloud พร้อมกัน!</p>
                  <button type="button" class="kc-big-cta is-blue" data-act="toggle-hide-words">✨ เปิดเฉลย Word Cloud ทันที!</button>
                </div>
              `
              : positioned.length
              ? `
                <div class="menti-cloud-canvas">
                  ${positioned
                    .map(
                      (w, idx) => `
                        <span
                          class="menti-word-item"
                          style="left:${w.leftPct}%;top:${w.topPct}%;font-size:clamp(15px, ${w.fontVmin}vmin, ${w.fontPx + 8}px);color:${w.color};z-index:${50 - idx}"
                          title="${esc(w.text)} (${w.count} ครั้ง)"
                          data-act="open-results-modal"
                          data-target-id="${esc(slide.targetId)}"
                        >${esc(w.text)}${w.count > 1 ? `<sup class="menti-word-count-sup">×${w.count}</sup>` : ""}</span>
                      `
                    )
                    .join("")}
                </div>
              `
              : `
                <div class="menti-cloud-empty">
                  <strong>💬 ส่งคำหรือประโยคสั้นๆ เข้ามาได้เลย!</strong>
                  <p>สแกน QR มุมซ้ายล่าง หรือพิมพ์เพิ่มสดจากแถบด้านล่างนี้ได้ทันที</p>
                  ${
                    m && m.uid === "m_smart"
                      ? `<button type="button" class="kp-btn is-primary" data-act="load-smart-demo">✨ ลองโหลดตัวอย่าง Word Cloud รุ่นพี่ Kuchi Gang</button>`
                      : `<button type="button" class="kp-btn" data-act="open-qr-modal">📱 เปิด QR Code ใหญ่ให้เพื่อนสแกน</button>`
                  }
                </div>
              `
          }
        </div>

        <form class="menti-host-quickbar" data-form="host-quick-word" data-target-id="${esc(slide.targetId)}">
          <input type="text" name="word" autocomplete="off" placeholder="พิมพ์คำ/ประโยค/อิโมจิ เพิ่มเข้า Word Cloud สด..." maxlength="52" />
          <button type="submit" class="kp-btn is-primary">+ ส่งขึ้นจอ</button>
          <button type="button" class="kp-btn" data-act="toggle-hide-words">${state.hideWordsUntilReveal ? "👁️ แสดงคำ" : "🙈 ซ่อนรอเฉลย"}</button>
          <button type="button" class="kp-btn" data-act="open-results-modal" data-target-id="${esc(slide.targetId)}">📊 ความถี่ (${agg.totalSubmissions})</button>
          ${
            m
              ? `<button type="button" class="kp-btn" data-act="jump-rating" data-uid="${esc(m.uid)}">⭐ ให้คะแนน 1–5 →</button>`
              : ""
          }
        </form>
      `;
    }

    if (slide.kind === "rating") {
      const m = slide.member;
      const wcAgg = getAggregatedWords(slide.targetId);
      const rMap = state.ratingsByTarget.get(slide.targetId) || new Map();
      const ratings = Array.from(rMap.values());
      const ownerRec = ratings.find((r) => r.isOwner || (m && r.memberUid === m.uid));
      const avg = ratings.length
        ? ratings.reduce((acc, r) => acc + Number(r.score || 0), 0) / ratings.length
        : 0;
      const displayVal = ownerRec ? Number(ownerRec.score) : avg;
      const pct = displayVal > 0 ? ((displayVal - 1) / 4) * 100 : 0;

      return `
        <div class="menti-prompt-header">
          <h2 class="menti-prompt-title">${slide.promptHtml}</h2>
          ${
            m
              ? `
                <div class="menti-person-floater" data-open-member="${esc(m.uid)}">
                  <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" />
                  <div class="menti-person-floater-txt">
                    <span class="menti-person-floater-nick">${esc(m.nickname)} · ${esc(m.firstName)}</span>
                    <span class="menti-person-floater-sub">คลิกกลับไปดู Word Cloud ได้</span>
                  </div>
                </div>
              `
              : ""
          }
        </div>

        <div class="menti-rating-stage">
          <div class="menti-mini-cloud-recap">
            <strong style="font-size:12.5px;color:#475569">☁️ คำสะท้อนเด่นของ ${esc(m ? m.nickname : "")}:</strong>
            ${
              wcAgg.items.length
                ? wcAgg.items
                    .slice(0, 10)
                    .map(
                      (w, idx) =>
                        `<span class="menti-mini-word-pill" style="color:${MENTI_COLORS[idx % MENTI_COLORS.length]}">${esc(w.text)}${w.count > 1 ? ` ×${w.count}` : ""}</span>`
                    )
                    .join("")
                : `<span style="font-size:12.5px;color:#94a3b8">ยังไม่มีคำใน Word Cloud ก่อนหน้า</span>`
            }
          </div>

          <div class="menti-scale-card">
            <div class="menti-scale-top-row">
              <span class="menti-scale-label">คะแนนความตรงกับตัวตนจริง (1.0 – 5.0)</span>
              <div class="menti-score-badges">
                ${
                  ownerRec
                    ? `<span class="menti-score-pill is-self">🎯 ${esc(m ? m.nickname : "เจ้าของชื่อ")} ให้คะแนน: ${Number(ownerRec.score).toFixed(1)} / 5</span>`
                    : `<span class="menti-score-pill is-self">🎯 รอ ${esc(m ? m.nickname : "เจ้าของชื่อ")} ให้คะแนน (คลิกบนแถบด้านล่างได้เลย)</span>`
                }
                ${
                  ratings.length
                    ? `<span class="menti-score-pill is-avg">👥 เฉลี่ยทั้งห้อง: ${avg.toFixed(2)} (${ratings.length} คน)</span>`
                    : ""
                }
              </div>
            </div>

            <div class="menti-track-outer" data-act="click-rating-bar" data-target-id="${esc(slide.targetId)}" title="คลิกบนแถบเพื่อให้คะแนน 1.0 – 5.0 ได้ทันที">
              <div class="menti-track-fill" style="width:${displayVal > 0 ? pct : 0}%"></div>
              ${
                ownerRec
                  ? `<div class="menti-self-pin" style="left:${((ownerRec.score - 1) / 4) * 100}%">★ ${esc(m ? m.nickname : "")}: ${Number(ownerRec.score).toFixed(1)}</div>`
                  : ""
              }
              ${
                displayVal > 0
                  ? `<div class="menti-track-knob" style="left:${pct}%">${displayVal.toFixed(1)}</div>`
                  : ""
              }
            </div>

            <div class="menti-scale-ticks">
              <span>1 · Strongly disagree</span>
              <span>2</span>
              <span>3 · Neutral</span>
              <span>4</span>
              <span>5 · Strongly agree</span>
            </div>

            <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap">
              ${[1, 2, 3, 3.5, 4, 4.5, 5]
                .map(
                  (v) =>
                    `<button type="button" class="kp-btn${ownerRec && Number(ownerRec.score) === v ? " is-primary" : ""}" data-act="quick-rate" data-target-id="${esc(slide.targetId)}" data-score="${v}">ให้ ${v}</button>`
                )
                .join("")}
              <button type="button" class="kp-btn is-roulette" data-act="spin-roulette">🎲 สุ่มคนถัดไป!</button>
            </div>
          </div>

          ${
            ratings.some((r) => r.reason)
              ? `
                <div class="menti-reasons-feed">
                  ${ratings
                    .filter((r) => r.reason)
                    .map(
                      (r) =>
                        `<div class="menti-reason-card${r.isOwner ? " is-owner" : ""}"><strong>${esc(r.nick)} (${Number(r.score).toFixed(1)}):</strong> ${esc(r.reason)}</div>`
                    )
                    .join("")}
                </div>
              `
              : ""
          }
        </div>
      `;
    }

    if (slide.kind === "roadmap") {
      return `
        <div class="kc-roster-top">
          <h2>เส้นทางเรียนรู้กลุ่มที่ 1: รพร.กุฉินารายณ์ จ.กาฬสินธุ์ (RACM 303 · 2569)</h2>
          <div class="kc-roster-actions">
            <a class="kp-btn is-primary" href="${esc(DATA.meta.icsPath)}" download="RACM303_2569_Group1_Kuchinarai.ics">📅 ดาวน์โหลดปฏิทินกลุ่มกุฉินารายณ์ (.ics)</a>
          </div>
        </div>
        <div class="kc-roadmap-grid">
          ${(DATA.roadmap || [])
            .map(
              (r) => `
                <div class="kc-road-card${r.step === "FIELD" ? " is-highlight" : ""}">
                  <span class="kc-road-step">${esc(r.step)}</span>
                  <span class="kc-road-date">${esc(r.date)} · ${esc(r.room)}</span>
                  <h3>${esc(r.title)}</h3>
                  <p>${esc(r.desc)}</p>
                </div>
              `
            )
            .join("")}
        </div>
      `;
    }

    if (slide.kind === "objectives") {
      return `
        <div class="kc-roster-top">
          <h2>5 วัตถุประสงค์หลักภาคสนาม &amp; หลักปฏิบัติสำคัญในพื้นที่</h2>
          <span class="kc-meta-chip">บูรณาการสู่การนำเสนอฟอร์ม 3A (29 ธ.ค.) &amp; 4A (30 ธ.ค.)</span>
        </div>
        <div class="kc-obj5-grid">
          ${(DATA.objectives5 || [])
            .map(
              (o) => `
                <div class="kc-obj-card">
                  <div class="kc-obj-num">${esc(o.no)}</div>
                  <div style="font-size:11px;font-weight:800;color:#2563eb">${esc(o.code)}</div>
                  <strong style="font-size:14px;color:#0f172a;line-height:1.3">${esc(o.title)}</strong>
                  <p style="margin:0;font-size:12px;color:#475569;line-height:1.45">${esc(o.detail)}</p>
                </div>
              `
            )
            .join("")}
        </div>
        <div style="margin-top:12px;padding:11px 16px;border-radius:14px;background:#fef2f2;border:1px solid #fecaca;font-size:12.5px;color:#991b1b;font-weight:600">
          🛡️ <strong>ความปลอดภัย &amp; จริยธรรมภาคสนาม:</strong> เดินทางด้วยพาหนะที่จัดให้เท่านั้น · ไม่แยกไปเก็บข้อมูลลำพัง · แจ้งพี่สมาร์ท/พี่ฟลุ๊คทุกครั้ง · เคารพชุมชนและรักษาความลับผู้ป่วย/PDPA 100% (ห้ามโพสต์ภาพติดข้อมูลผู้ป่วยลงโซเชียล)
        </div>
      `;
    }

    if (slide.kind === "yearbook") {
      return `
        <div class="kc-roster-top">
          <h2>สมุดที่ระลึก Kuchi Gang 2569 (${esc(getCurrentSessionLabel())})</h2>
          <div class="kc-roster-actions">
            <button type="button" class="kp-btn is-primary" data-act="print-yearbook">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
            <button type="button" class="kp-btn" data-act="export-json">💾 Export ข้อมูล (.json)</button>
          </div>
        </div>
        <div class="kc-yearbook-scroll">
          ${MEMBERS.map((m) => {
            const agg = getAggregatedWords(m.uid);
            const rMap = state.ratingsByTarget.get(m.uid) || new Map();
            const ownerRec = Array.from(rMap.values()).find((r) => r.isOwner || r.memberUid === m.uid);
            const topWords = agg.items
              .slice(0, 6)
              .map((w) => `${w.text}${w.count > 1 ? `(${w.count})` : ""}`)
              .join(" · ");
            return `
              <div class="kc-yb-card" data-open-member="${esc(m.uid)}" style="cursor:pointer">
                <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" />
                <div style="min-width:0;flex:1">
                  <div style="font-weight:800;font-size:13px;color:#0f172a">
                    ${esc(m.nickname)} <span style="font-weight:600;color:#64748b;font-size:11px">${esc(m.firstName)}</span>
                    ${ownerRec ? `<span style="color:#d97706;font-size:11px">★${Number(ownerRec.score).toFixed(1)}</span>` : ""}
                  </div>
                  <div class="kc-yb-words">${topWords ? esc(topWords) : `<span style="color:#94a3b8">ยังไม่มีคำสะท้อน</span>`}</div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    return "";
  }

  function getCurrentSessionLabel() {
    const s = (DATA.sessions || []).find((x) => x.id === state.sessionId);
    return s ? s.label : state.sessionId;
  }

  function getSlideResponseCount(slide) {
    if (!slide) return { text: String(state.presence.size), isZero: state.presence.size === 0 };
    if (slide.kind === "wordcloud") {
      const agg = getAggregatedWords(slide.targetId);
      const denom = Math.max(state.presence.size, agg.uniqueRespondents);
      if (agg.totalSubmissions === 0) return { text: "0", isZero: true };
      return { text: denom > 0 ? `${agg.uniqueRespondents}/${denom} (${agg.totalSubmissions})` : String(agg.totalSubmissions), isZero: false };
    }
    if (slide.kind === "rating") {
      const mp = state.ratingsByTarget.get(slide.targetId);
      const cnt = mp ? mp.size : 0;
      return { text: String(cnt), isZero: cnt === 0 };
    }
    return { text: String(state.presence.size), isZero: state.presence.size === 0 };
  }

  function renderModalsHtml() {
    let html = "";

    // 1. 16:9 Hero Member Spotlight Modal
    if (state.spotlightMember) {
      const m = state.spotlightMember;
      const agg = getAggregatedWords(m.uid);
      html += `
        <div class="kc-modal-backdrop" data-act="close-modals">
          <div class="kc-modal-card" onclick="event.stopPropagation()">
            <div class="kc-spotlight-grid">
              <img class="kc-spotlight-photo" src="${esc(m.photo)}" alt="${esc(m.fullName)}" />
              <div>
                <div class="kc-kicker">🌟 KUCHI GANG 2569 SPOTLIGHT</div>
                <h2 style="margin:0 0 6px;font-size:34px;font-weight:800;color:#0f172a">
                  น้อง${esc(m.nickname)} <span style="font-size:22px;font-weight:600;color:#475569">(${esc(m.fullName)})</span>
                </h2>
                <div class="kc-meta-pills" style="margin:12px 0 16px">
                  ${
                    m.kind === "student"
                      ? `
                        <span class="kc-meta-chip">🆔 รหัส ${esc(m.id)}</span>
                        <span class="kc-meta-chip">🎓 หลักสูตร ${esc(m.program)}</span>
                        <span class="kc-meta-chip">💬 Discussion กลุ่ม ${m.disc}</span>
                        <span class="kc-meta-chip">🏥 รพร.กุฉินารายณ์ #${m.studentNo}/20</span>
                      `
                      : `<span class="kc-meta-chip">✨ ${esc(m.roleBadge)}</span>`
                  }
                </div>
                <p style="margin:0 0 18px;font-size:14.5px;color:#475569;line-height:1.5">
                  ชวนแนะนำตัวสั้นๆ ให้เพื่อนและอาจารย์รู้จัก (เช่น ชื่อเล่น ที่มาชื่อเล่น สิ่งที่ชอบ หรือสิ่งที่ตั้งตารอในทริปกุฉินารายณ์!)
                  จากนั้นกดไปเปิดหน้า <strong>Word Cloud (${agg.totalSubmissions} คำ)</strong> กันเลย!
                </p>
                <div style="display:flex;gap:10px;flex-wrap:wrap">
                  <button type="button" class="kc-big-cta is-blue" data-act="jump-member-wc" data-uid="${esc(m.uid)}">💬 เปิดหน้า Word Cloud ของ '${esc(m.mentiName)}' →</button>
                  <button type="button" class="kc-big-cta is-pink" data-act="spin-roulette">🎲 สุ่มคนถัดไป</button>
                  <button type="button" class="kc-big-cta is-outline" data-act="close-modals">ปิดหน้าต่าง</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // 2. Quick QR Modal
    if (state.qrModalOpen) {
      const joinUrl = getJoinUrl();
      html += `
        <div class="kc-modal-backdrop" data-act="close-modals">
          <div class="kc-modal-card" style="max-width:480px;text-align:center" onclick="event.stopPropagation()">
            <h2 style="margin:0 0 6px;font-size:24px">สแกนเข้าร่วม Kuchi Gang Live</h2>
            <p style="margin:0 0 14px;color:#64748b;font-size:14px">เปิดกล้องมือถือหรือ LINE สแกนเพื่อส่งคำเข้า Word Cloud สด</p>
            <div class="kc-qr-frame" style="margin:0 auto 14px;width:270px">
              ${buildQrSvg(joinUrl)}
              <div class="kc-qr-center-badge">KG</div>
            </div>
            <div class="kc-url-box" style="margin-bottom:14px">
              <span style="flex:1">${esc(joinUrl)}</span>
              <button type="button" class="kp-btn" data-act="copy-join-url">คัดลอก</button>
            </div>
            <button type="button" class="kp-btn is-primary" data-act="close-modals">พร้อมลุยต่อ</button>
          </div>
        </div>
      `;
    }

    // 3. Mentimeter Results Frequency Table Modal
    if (state.resultsModalTargetId) {
      const tid = state.resultsModalTargetId;
      const agg = getAggregatedWords(tid);
      const mem = MEMBER_MAP.get(tid);
      html += `
        <div class="kc-modal-backdrop" data-act="close-modals">
          <div class="kc-modal-card" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
              <h3 style="margin:0;font-size:20px">Results — ${esc(mem ? mem.mentiName : "Word Cloud")} (${agg.totalSubmissions} คำ)</h3>
              <div style="display:flex;gap:8px">
                <button type="button" class="kp-btn" style="color:#dc2626;border-color:#fecaca" data-act="clear-target" data-target-id="${esc(tid)}">🗑️ ล้างคำสไลด์นี้</button>
                <button type="button" class="kp-btn" data-act="close-modals">✕ ปิด</button>
              </div>
            </div>
            <table class="kc-freq-table">
              <thead>
                <tr>
                  <th>Word / Phrase</th>
                  <th style="width:150px">Occurrences</th>
                  <th style="width:80px">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${
                  agg.items.length
                    ? agg.items
                        .map(
                          (item) => `
                            <tr>
                              <td><strong>${esc(item.text)}</strong></td>
                              <td>${item.count}</td>
                              <td><button type="button" class="kp-btn" data-act="delete-word-norm" data-target-id="${esc(tid)}" data-norm="${esc(item.key)}">ลบ</button></td>
                            </tr>
                          `
                        )
                        .join("")
                    : `<tr><td colspan="3" style="color:#94a3b8;text-align:center">ยังไม่มีคำที่ส่งเข้ามา</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    return html;
  }

  function renderPresenter() {
    document.body.className = "mode-presenter" + (document.fullscreenElement ? " is-fullscreen-stage" : "");
    const root = document.getElementById("appRoot");
    if (!root) return;

    const slide = SLIDES[state.slideIdx] || SLIDES[0];
    const countInfo = getSlideResponseCount(slide);

    root.innerHTML = `
      <header class="kp-topbar">
        <div class="kp-brand">
          <div class="kp-brand-logo">KG</div>
          <div class="kp-brand-text">
            <span class="kp-brand-title">กลุ่มกุฉินารายณ์ · อ.ณัฐวุฒิ (พี่สมาร์ท)</span>
            <span class="kp-brand-sub">RACM 303 ปี 2569 · รพร.กุฉินารายณ์ จ.กาฬสินธุ์ (20 นศพ. · ห้อง 3B1-01)</span>
          </div>
        </div>

        <div class="kp-controls">
          <select class="kp-select" data-act="change-session" aria-label="เลือกรอบกิจกรรม">
            ${(DATA.sessions || [])
              .map((s) => `<option value="${esc(s.id)}" ${s.id === state.sessionId ? "selected" : ""}>${esc(s.shortLabel)}</option>`)
              .join("")}
          </select>

          <select class="kp-select" data-act="jump-slide-select" aria-label="ข้ามไปยังสไลด์" style="max-width:225px">
            ${SLIDES.map((s, i) => `<option value="${i}" ${i === state.slideIdx ? "selected" : ""}>${esc(s.navLabel)}</option>`).join("")}
          </select>

          <button type="button" class="kp-btn is-roulette" data-act="spin-roulette" title="สุ่มการ์ดรูปแนะนำตัวบนจอ 16:9 (คีย์ลัด R)">🎲 สุ่มคนถัดไป</button>
          <button type="button" class="kp-btn ${state.skipRatingSlides ? "is-active" : ""}" data-act="toggle-skip-rating" title="สลับระหว่างเล่นครบ Word Cloud + Rating 1–5 หรือเฉพาะ Word Cloud">
            ${state.skipRatingSlides ? "⚡ เฉพาะ Word Cloud" : "⭐ WC + Rating 1–5"}
          </button>
          <button type="button" class="kp-btn" data-act="open-qr-modal" title="แสดง QR Code (คีย์ลัด Q)">📱 QR</button>
          <button type="button" class="kp-btn" data-act="switch-to-join" title="สลับดูหน้าจอมือถือผู้เข้าร่วม">📲 มุมมองมือถือ</button>
          <button type="button" class="kp-btn" data-act="toggle-mute" title="เปิด/ปิดเสียงเอฟเฟกต์">${state.muted ? "🔇" : "🔊"}</button>
          <button type="button" class="kp-btn" data-act="toggle-fullscreen" title="เต็มจอ 16:9 (คีย์ลัด F)">⛶ เต็มจอ</button>
          <span class="kp-live-pill ${state.connectedCount > 0 ? "" : "is-offline"}" id="kpConnBadge" data-act="open-qr-modal">
            <span class="kp-live-dot"></span>
            <span>${state.connectedCount > 0 ? `Live · ${state.presence.size} ออนไลน์` : "กำลังเชื่อม Live..."}</span>
          </span>
        </div>
      </header>

      <main class="kp-stage-wrap">
        <section class="kp-stage-16x9" aria-live="polite">
          ${renderMentiDecorHtml()}

          <div class="kp-slide-body">
            ${renderSlideInnerHtml(slide)}
          </div>

          <footer class="menti-stage-footer">
            <div class="menti-nav-cluster">
              <div class="menti-nav-pill">
                <button type="button" class="menti-step-btn" data-act="prev-slide" ${state.slideIdx <= 0 ? "disabled" : ""} aria-label="สไลด์ก่อนหน้า">‹</button>
                <span class="menti-slide-pos">${state.slideIdx + 1} / ${SLIDES.length}</span>
                <button type="button" class="menti-step-btn" data-act="next-slide" ${state.slideIdx >= SLIDES.length - 1 ? "disabled" : ""} aria-label="สไลด์ถัดไป">›</button>
              </div>
              <button type="button" class="menti-mini-qr-btn" data-act="goto-roster">🖼️ การ์ด 22 คน</button>
              <button type="button" class="menti-mini-qr-btn" data-act="open-qr-modal">📱 QR เข้าห้อง</button>
            </div>

            <div class="menti-counter-cluster">
              <button type="button" class="menti-count-badge ${countInfo.isZero ? "is-zero" : ""}" data-act="${slide.kind === "wordcloud" ? "open-results-modal" : "open-qr-modal"}" data-target-id="${esc(slide.targetId || "")}">
                <span>👥</span>
                <span>${esc(countInfo.text)}</span>
              </button>
            </div>
          </footer>
        </section>
      </main>

      ${renderModalsHtml()}
    `;
  }

  /* ---------- 11. Render Smartphone Participant App (#join) ---------- */
  function renderParticipant() {
    document.body.className = "mode-participant";
    const root = document.getElementById("appRoot");
    if (!root) return;

    const myMem = MEMBER_MAP.get(state.myMemberUid);
    const hasIdentity = Boolean(myMem || state.myGuestName);
    const slide = SLIDES[state.slideIdx] || SLIDES[0];

    if (!hasIdentity) {
      root.innerHTML = `
        <div class="kj-shell">
          <div class="kj-header">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="kp-brand-logo">KG</div>
              <div>
                <div style="font-weight:800;font-size:15px">Kuchi Gang 2569 · Live</div>
                <div style="font-size:12px;color:#64748b">กลุ่ม รพร.กุฉินารายณ์ · อ.ณัฐวุฒิ</div>
              </div>
            </div>
            <button type="button" class="kp-btn" data-act="switch-to-presenter">🖥️ จอหลัก</button>
          </div>

          <div class="kj-card">
            <h2 style="margin:0 0 6px;font-size:19px">แตะเลือกชื่อของคุณเพื่อเข้าห้องสด 👋</h2>
            <p style="margin:0;font-size:13.5px;color:#64748b">เลือกการ์ดรูปตัวเองในกลุ่มกุฉินารายณ์ (ครั้งเดียวจำค่าอัตโนมัติ)</p>

            <div class="kj-picker-grid">
              ${MEMBERS.map(
                (m) => `
                  <button type="button" class="kj-pick-btn" data-act="pick-identity" data-uid="${esc(m.uid)}">
                    <img src="${esc(m.photo)}" alt="${esc(m.nickname)}" />
                    <strong style="font-size:13px;color:#0f172a">${esc(m.nickname)}</strong>
                    <span style="font-size:10.5px;color:#64748b">${esc(m.kind === "student" ? m.shortNo : m.firstName)}</span>
                  </button>
                `
              ).join("")}
            </div>

            <form data-form="guest-join" style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0">
              <label style="display:block;font-size:12.5px;font-weight:700;color:#475569;margin-bottom:6px">หรือพิมพ์ชื่อเล่น (กรณีผู้เข้าร่วมสมทบ):</label>
              <div style="display:flex;gap:8px">
                <input type="text" name="guestName" class="kj-input" style="margin:0;height:40px" placeholder="ชื่อเล่นของคุณ..." maxlength="28" />
                <button type="submit" class="kp-btn is-primary" style="height:40px">เข้าร่วม</button>
              </div>
            </form>
          </div>
        </div>
      `;
      return;
    }

    // Active Participant Controller synced with Presenter Slide
    let interactiveHtml = "";
    if (slide.kind === "wordcloud") {
      const m = slide.member;
      const mp = state.wordsByTarget.get(slide.targetId) || new Map();
      const mySent = Array.from(mp.values()).filter((x) => x.pid === persistentPid);

      interactiveHtml = `
        <div class="kj-card">
          ${
            m
              ? `
                <div class="kj-target-banner">
                  <img src="${esc(m.photo)}" alt="${esc(m.fullName)}" />
                  <div>
                    <div style="font-size:11.5px;font-weight:800;color:#2563eb">WORD CLOUD สดบนจอใหญ่</div>
                    <strong style="font-size:17px;color:#0f172a">'${esc(m.mentiName)}'</strong>
                    <div style="font-size:12px;color:#475569">${esc(m.fullName)}</div>
                  </div>
                </div>
              `
              : `<div class="kc-kicker">☁️ WORD CLOUD สด</div>`
          }

          <p style="margin:0 0 12px;font-size:14.5px;font-weight:600;color:#0f172a;line-height:1.4">
            ${slide.promptHtml}
          </p>

          <form data-form="mobile-word" data-target-id="${esc(slide.targetId)}">
            <input type="text" id="kjWordInput1" name="w1" class="kj-input" autocomplete="off" placeholder="คำหรือประโยคสั้นๆ ที่ 1..." maxlength="52" />
            <input type="text" name="w2" class="kj-input" autocomplete="off" placeholder="คำหรือประโยคสั้นๆ ที่ 2 (ถ้ามี)..." maxlength="52" />
            <input type="text" name="w3" class="kj-input" autocomplete="off" placeholder="คำหรือประโยคสั้นๆ ที่ 3 (ถ้ามี)..." maxlength="52" />

            <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px">แตะใส่อิโมจิด่วน:</div>
            <div class="kj-emoji-row">
              ${QUICK_EMOJIS.map((em) => `<button type="button" class="kj-emoji-chip" data-act="insert-emoji" data-emoji="${em}">${em}</button>`).join("")}
            </div>

            <button type="submit" class="kj-submit-btn">🚀 ส่งคำขึ้นจอ Word Cloud</button>
          </form>

          ${
            mySent.length
              ? `
                <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0">
                  <div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:6px">✓ คำที่คุณส่งให้สไลด์นี้แล้ว (${mySent.length}):</div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${mySent.map((w) => `<span class="menti-mini-word-pill">${esc(w.text)}</span>`).join("")}
                  </div>
                </div>
              `
              : ""
          }
        </div>
      `;
    } else if (slide.kind === "rating") {
      const m = slide.member;
      const isMe = Boolean(myMem && m && myMem.uid === m.uid);
      const rMap = state.ratingsByTarget.get(slide.targetId) || new Map();
      const prevMine = rMap.get(persistentPid);
      const initVal = prevMine ? prevMine.score : 4;

      interactiveHtml = `
        <div class="kj-card">
          ${
            isMe
              ? `<div style="padding:10px 12px;border-radius:12px;background:#fef3c7;border:1.5px solid #f59e0b;color:#92400e;font-weight:800;font-size:13.5px;margin-bottom:12px">🌟 ตาของคุณแล้ว! ให้คะแนนว่า Word Cloud ที่เพื่อนๆ ส่งมาตรงกับตัวตนจริงแค่ไหน</div>`
              : ""
          }
          <p style="margin:0 0 14px;font-size:14.5px;font-weight:600;color:#0f172a;line-height:1.4">
            ${slide.promptHtml}
          </p>
          <form data-form="mobile-rating" data-target-id="${esc(slide.targetId)}">
            <div style="text-align:center;font-size:32px;font-weight:800;color:#2563eb;margin-bottom:4px" id="kjSliderValLabel">${Number(initVal).toFixed(1)} / 5.0</div>
            <input type="range" name="score" min="1" max="5" step="0.5" value="${initVal}" class="kj-slider" oninput="document.getElementById('kjSliderValLabel').textContent = Number(this.value).toFixed(1) + ' / 5.0'" />
            <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#64748b;margin-bottom:14px">
              <span>1 (Strongly disagree)</span>
              <span>5 (Strongly agree)</span>
            </div>
            <input type="text" name="reason" class="kj-input" value="${esc(prevMine ? prevMine.reason : "")}" placeholder="เหตุผลสั้นๆ (ไม่บังคับ) เช่น แม่นมากเรื่องกล้องฟิล์ม!" maxlength="140" />
            <button type="submit" class="kj-submit-btn">⭐ ส่งคะแนนขึ้นจอใหญ่</button>
          </form>
        </div>
      `;
    } else {
      interactiveHtml = `
        <div class="kj-card" style="text-align:center">
          <div style="font-size:38px;margin-bottom:6px">🚂✨</div>
          <h3 style="margin:0 0 6px;font-size:18px">เชื่อมต่อกับจอหน้าห้องสำเร็จแล้ว!</h3>
          <p style="margin:0 0 14px;font-size:13.5px;color:#475569;line-height:1.5">
            ขณะนี้จอใหญ่อยู่ที่สไลด์ <strong>${esc(slide.navLabel)}</strong><br/>
            ทันทีที่ อ.ณัฐวุฒิ เปิดสไลด์ Word Cloud หรือสุ่มชื่อเพื่อน หน้าจอมือถือนี้จะเปลี่ยนตามให้อัตโนมัติทันที!
          </p>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <a class="kp-btn is-primary" href="${esc(DATA.meta.icsPath)}" download="RACM303_2569_Group1_Kuchinarai.ics">📅 บันทึกปฏิทินกุฉินารายณ์ (.ics)</a>
          </div>
        </div>
      `;
    }

    root.innerHTML = `
      <div class="kj-shell">
        <div class="kj-header">
          <div style="display:flex;align-items:center;gap:9px;min-width:0">
            ${
              myMem
                ? `<img src="${esc(myMem.photo)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;object-position:center 16%;border:2px solid #2563eb" />`
                : `<div class="kp-brand-logo">KG</div>`
            }
            <div style="min-width:0">
              <div style="font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${esc(myMem ? `${myMem.nickname} (${myMem.firstName})` : state.myGuestName)}
              </div>
              <div style="font-size:11px;color:#16a34a;font-weight:700">
                ● ซิงค์สดกับหน้าห้องแล้ว
              </div>
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="kp-btn" data-act="change-identity">เปลี่ยนชื่อ</button>
            <button type="button" class="kp-btn" data-act="switch-to-presenter">🖥️ จอสไลด์</button>
          </div>
        </div>

        ${interactiveHtml}

        <div class="kj-card" style="padding:13px 16px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-size:12.5px;font-weight:700;color:#475569">หรือเลือกส่งคำให้เพื่อนคนอื่นล่วงหน้า:</span>
            <select class="kp-select" data-act="mobile-jump-slide" style="max-width:200px">
              <option value="-1" ${state.followHost ? "selected" : ""}>🔄 ซิงค์ตามจออาจารย์อัตโนมัติ</option>
              ${SLIDES.map((s, idx) =>
                s.kind === "wordcloud"
                  ? `<option value="${idx}" ${!state.followHost && state.slideIdx === idx ? "selected" : ""}>${esc(s.navLabel)}</option>`
                  : ""
              ).join("")}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  function updateConnectionBadge() {
    const el = document.getElementById("kpConnBadge");
    if (!el) return;
    el.classList.toggle("is-offline", state.connectedCount <= 0);
    el.innerHTML = `<span class="kp-live-dot"></span><span>${state.connectedCount > 0 ? `Live · ${state.presence.size} ออนไลน์` : "ออฟไลน์ / Local"}</span>`;
  }

  function render() {
    if (state.mode === "participant") renderParticipant();
    else renderPresenter();
  }

  /* ---------- 12. Delegated Event Listeners & Keyboard / Clicker Controls ---------- */
  document.addEventListener("click", (ev) => {
    const memberTrigger = ev.target.closest("[data-open-member]");
    if (memberTrigger && state.mode === "presenter") {
      const uid = memberTrigger.getAttribute("data-open-member");
      const mem = MEMBER_MAP.get(uid);
      if (mem) {
        state.spotlightMember = mem;
        render();
      }
      return;
    }

    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");

    if (act === "prev-slide") stepSlide(-1);
    else if (act === "next-slide") stepSlide(1);
    else if (act === "goto-qr") goToSlide(SLIDES.findIndex((s) => s.kind === "qr"));
    else if (act === "goto-roster") goToSlide(SLIDES.findIndex((s) => s.kind === "roster"));
    else if (act === "goto-roadmap") goToSlide(SLIDES.findIndex((s) => s.kind === "roadmap"));
    else if (act === "spin-roulette") spinSpotlightRoulette();
    else if (act === "reset-picked") {
      state.pickedUids.clear();
      state.rouletteHighlightUid = "";
      saveSessionStore();
      render();
    } else if (act === "jump-member-wc") {
      const uid = btn.getAttribute("data-uid");
      state.spotlightMember = null;
      const idx = SLIDES.findIndex((s) => s.id === `wc_${uid}`);
      if (idx >= 0) goToSlide(idx);
    } else if (act === "jump-rating") {
      const uid = btn.getAttribute("data-uid");
      const idx = SLIDES.findIndex((s) => s.id === `rt_${uid}`);
      if (idx >= 0) goToSlide(idx);
    } else if (act === "open-qr-modal") {
      state.qrModalOpen = true;
      render();
    } else if (act === "open-results-modal") {
      state.resultsModalTargetId = btn.getAttribute("data-target-id") || "";
      render();
    } else if (act === "close-modals") {
      state.spotlightMember = null;
      state.qrModalOpen = false;
      state.resultsModalTargetId = "";
      render();
    } else if (act === "copy-join-url") {
      const url = getJoinUrl();
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
      btn.textContent = "✓ คัดลอกแล้ว";
      setTimeout(() => {
        btn.textContent = "คัดลอก";
      }, 1500);
    } else if (act === "toggle-skip-rating") {
      state.skipRatingSlides = !state.skipRatingSlides;
      sSet("kuchi2569_skip_rating", state.skipRatingSlides ? "1" : "0");
      render();
    } else if (act === "toggle-hide-words") {
      state.hideWordsUntilReveal = !state.hideWordsUntilReveal;
      render();
    } else if (act === "toggle-mute") {
      state.muted = !state.muted;
      sSet("kuchi2569_muted", state.muted ? "1" : "0");
      render();
    } else if (act === "toggle-fullscreen") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    } else if (act === "load-smart-demo") {
      loadLegacyDemoForSmart();
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
        scheduleHostSnapshotPublish();
        render();
      }
    } else if (act === "clear-target") {
      const tid = btn.getAttribute("data-target-id");
      if (tid) {
        state.wordsByTarget.delete(tid);
        state.ratingsByTarget.delete(tid);
        saveSessionStore();
        publishPacket("clear_target", { type: "clear_target", targetId: tid }, false);
        scheduleHostSnapshotPublish();
        render();
      }
    } else if (act === "quick-rate") {
      const tid = btn.getAttribute("data-target-id");
      const sc = Number(btn.getAttribute("data-score"));
      submitRating(tid, sc, "");
    } else if (act === "click-rating-bar") {
      const rect = btn.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
      const rawScore = Math.round((1 + ratio * 4) * 2) / 2;
      submitRating(btn.getAttribute("data-target-id"), rawScore, "");
    } else if (act === "print-yearbook") {
      window.print();
    } else if (act === "export-json") {
      const payload = {
        exportedAt: new Date().toISOString(),
        session: state.sessionId,
        group: DATA.meta,
        words: Object.fromEntries(Array.from(state.wordsByTarget.entries()).map(([k, mp]) => [k, Array.from(mp.values())])),
        ratings: Object.fromEntries(Array.from(state.ratingsByTarget.entries()).map(([k, mp]) => [k, Array.from(mp.values())]))
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `KuchiGang2569_${state.sessionId}.json`;
      a.click();
    } else if (act === "switch-to-join") {
      state.mode = "participant";
      window.history.replaceState(null, "", "#join");
      render();
    } else if (act === "switch-to-presenter") {
      state.mode = "presenter";
      window.history.replaceState(null, "", "#");
      render();
    } else if (act === "pick-identity") {
      const uid = btn.getAttribute("data-uid") || "";
      state.myMemberUid = uid;
      state.myGuestName = "";
      sSet("kuchi2569_my_uid", uid);
      sSet("kuchi2569_guest_name", "");
      publishMyPresence();
      publishPacket("hello", { type: "hello_request" }, false);
      render();
    } else if (act === "change-identity") {
      state.myMemberUid = "";
      state.myGuestName = "";
      sSet("kuchi2569_my_uid", "");
      sSet("kuchi2569_guest_name", "");
      render();
    } else if (act === "insert-emoji") {
      const em = btn.getAttribute("data-emoji") || "";
      const inp = document.getElementById("kjWordInput1");
      if (inp) {
        inp.value = (inp.value ? inp.value + " " : "") + em;
        inp.focus();
      }
    }
  });

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t || !t.getAttribute) return;
    const act = t.getAttribute("data-act");
    if (act === "jump-slide-select") {
      goToSlide(Number(t.value) || 0);
    } else if (act === "change-session") {
      state.sessionId = String(t.value || "sg1_intro");
      sSet("kuchi2569_session", state.sessionId);
      loadSessionStore(state.sessionId);
      broadcastPointer();
      scheduleHostSnapshotPublish();
      render();
    } else if (act === "toggle-mentor-pool") {
      state.rouletteIncludeMentors = Boolean(t.checked);
      sSet("kuchi2569_roul_mentors", state.rouletteIncludeMentors ? "1" : "0");
      render();
    } else if (act === "mobile-jump-slide") {
      const val = Number(t.value);
      if (val < 0) {
        state.followHost = true;
      } else {
        state.followHost = false;
        state.slideIdx = val;
      }
      render();
    }
  });

  document.addEventListener("submit", (ev) => {
    const form = ev.target;
    if (!form || !form.getAttribute) return;
    const kind = form.getAttribute("data-form");
    if (!kind) return;
    ev.preventDefault();

    if (kind === "host-quick-word") {
      const tid = form.getAttribute("data-target-id");
      const inp = form.elements.word;
      if (inp && submitWord(tid, inp.value)) {
        inp.value = "";
      }
    } else if (kind === "guest-join") {
      const name = String((form.elements.guestName && form.elements.guestName.value) || "").trim();
      if (name) {
        state.myGuestName = name;
        sSet("kuchi2569_guest_name", name);
        publishMyPresence();
        render();
      }
    } else if (kind === "mobile-word") {
      const tid = form.getAttribute("data-target-id");
      let sentAny = false;
      ["w1", "w2", "w3"].forEach((k) => {
        const el = form.elements[k];
        if (el && String(el.value || "").trim()) {
          if (submitWord(tid, el.value)) sentAny = true;
          el.value = "";
        }
      });
      if (!sentAny && form.elements.w1) form.elements.w1.focus();
    } else if (kind === "mobile-rating") {
      const tid = form.getAttribute("data-target-id");
      const sc = form.elements.score ? form.elements.score.value : 4;
      const rsn = form.elements.reason ? form.elements.reason.value : "";
      submitRating(tid, sc, rsn);
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (state.mode !== "presenter") return;
    const tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (ev.key === "Escape") {
      if (state.spotlightMember || state.qrModalOpen || state.resultsModalTargetId) {
        state.spotlightMember = null;
        state.qrModalOpen = false;
        state.resultsModalTargetId = "";
        render();
      }
      return;
    }

    if (ev.key === "ArrowRight" || ev.key === "PageDown" || ev.key === " ") {
      ev.preventDefault();
      stepSlide(1);
    } else if (ev.key === "ArrowLeft" || ev.key === "PageUp") {
      ev.preventDefault();
      stepSlide(-1);
    } else if (ev.key === "r" || ev.key === "R") {
      ev.preventDefault();
      spinSpotlightRoulette();
    } else if (ev.key === "q" || ev.key === "Q") {
      ev.preventDefault();
      state.qrModalOpen = !state.qrModalOpen;
      render();
    } else if (ev.key === "f" || ev.key === "F") {
      ev.preventDefault();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener("fullscreenchange", () => render());
  window.addEventListener("hashchange", () => {
    const wantJoin = isJoinHash();
    if (wantJoin && state.mode !== "participant") {
      state.mode = "participant";
      render();
    } else if (!wantJoin && state.mode !== "presenter") {
      state.mode = "presenter";
      render();
    }
  });

  render();
  initTransports();
})();
