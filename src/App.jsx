import { useState, useRef, useCallback, useEffect } from "react";

const FONTS = "https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";

const C = {
  bg: "#f0f4f0", paper: "#fafcfa", green: "#2d6a4f", greenLight: "#d8ead8",
  orange: "#d4a017", orangeLight: "#fef9e7", ink: "#1a2e1a", muted: "#5a7a5a",
  border: "#c8dfc8",
  high: "#2d6a4f", highBg: "#d8ead8",
  mid: "#92400e", midBg: "#fef3c7",
  low: "#991b1b", lowBg: "#fee2e2",
};

// ?? SRS helpers ????????????????????????????????????????????????????????????
const SRS_DAYS = { high: 7, mid: 3, low: 1 };
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const isdue = (s) => !s.nextReviewDate || s.nextReviewDate <= todayStr();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue(sentences, goal) {
  const never = shuffle(sentences.filter(s => !s.nextReviewDate));
  const due = shuffle(sentences.filter(s => s.nextReviewDate && s.nextReviewDate <= todayStr()));
  const combined = [...never, ...due];
  return combined.slice(0, goal);
}

// ?? Persist helpers ????????????????????????????????????????????????????????
const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

// ?? Initial data ???????????????????????????????????????????????????????????
const INITIAL_SENTENCES = [
  { id: 1, korean: "???留ㅼ씪 ?꾩묠 ?쇱컢 ?쇱뼱?섏슂.", english: "I wake up early every morning.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01" },
  { id: 2, korean: "?ㅻ뒛 ?뚯쓽媛 ???쒖뿉 ?덉뼱??", english: "I have a meeting at three o'clock today.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01" },
  { id: 3, korean: "???꾨줈?앺듃???ㅼ쓬 ?ш퉴吏 ?꾨즺?댁빞 ?댁슂.", english: "This project needs to be completed by next month.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01" },
  { id: 4, korean: "?좎뵪媛 醫뗭쑝硫?怨듭썝???곗콉?섎윭 媛덇쾶??", english: "If the weather is nice, I'll go for a walk in the park.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01" },
];

// ?? API ????????????????????????????????????????????????????????????????????
async function callClaude(messages, system) {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(res.status + ": " + e); }
  const d = await res.json();
  return d.content[0].text;
}

function getGrade(score) {
  if (score >= 75) return "??;
  if (score >= 45) return "以?;
  return "??;
}

// ?? Sub-components ?????????????????????????????????????????????????????????
function GradeBadge({ grade, large }) {
  const size = large ? { fontSize: 20, padding: "7px 20px", borderRadius: 28 } : { fontSize: 11, padding: "3px 9px", borderRadius: 16 };
  const bg = grade === "?? ? C.highBg : grade === "以? ? C.midBg : C.lowBg;
  const color = grade === "?? ? C.high : grade === "以? ? C.mid : C.low;
  return <span style={{ ...size, fontWeight: 700, fontFamily: "'Nanum Gothic', sans-serif", background: bg, color: color, border: "1.5px solid " + color + "30", display: "inline-block" }}>{grade}</span>;
}

function Waveform({ active }) {
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center", height: 18 }}>
      {[0,1,2,3,4].map(i => (
        <span key={i} style={{ display: "inline-block", width: 3, borderRadius: 2, background: active ? C.orange : C.border, height: active ? undefined : 6, animation: active ? "bar 0.7s ease-in-out infinite alternate " + (i*0.1) + "s" : "none" }} />
      ))}
      <style>{"@keyframes bar{0%{height:3px}100%{height:18px}}"}</style>
    </span>
  );
}

// ?? Main App ???????????????????????????????????????????????????????????????
export default function App() {
  const [view, setView] = useState("practice");
  const [sentences, setSentences] = useState(() => load("su_sentences", INITIAL_SENTENCES));
  const [dailyGoal, setDailyGoal] = useState(() => load("su_goal", 5));
  const [extraGoal, setExtraGoal] = useState(0); // 異붽? ?곗뒿 紐⑺몴
  const [studyDates, setStudyDates] = useState(() => load("su_dates", [])); // ["YYYY-MM-DD", ...]
  const [history, setHistory] = useState(() => load("su_history", []));
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  // Practice state
  const [queueIds, setQueueIds] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [phase, setPhase] = useState("ready");
  const [spokenText, setSpokenText] = useState("");
  const [typedText, setTypedText] = useState("");
  const [useTyping, setUseTyping] = useState(false);
  const [evalResult, setEvalResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [doneToday, setDoneToday] = useState(() => {
    const t = todayStr();
    return load("su_done_today", { date: t, ids: [] }).date === t ? load("su_done_today", { date: t, ids: [] }).ids : [];
  });

  // Manage state
  const [newKo, setNewKo] = useState("");
  const [newEn, setNewEn] = useState("");
  const [translating, setTranslating] = useState(null);
  const [genTopic, setGenTopic] = useState("");
  const [genCount, setGenCount] = useState(5);
  const [genCountCustom, setGenCountCustom] = useState("");
  const [generating, setGenerating] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvSuccess, setCsvSuccess] = useState("");
  const [manageTab, setManageTab] = useState("single");
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | new | due | done
  const [expandedIds, setExpandedIds] = useState({});
  const toggleExpand = (id) => setExpandedIds(p => ({ ...p, [id]: !p[id] }));

  const recRef = useRef(null);
  const transcriptRef = useRef("");
  const evaluatedRef = useRef(false);
  const doEvalRef = useRef(null);
  const currentRef = useRef(null);

  // ?? Persist on change ??
  useEffect(() => { save("su_sentences", sentences); }, [sentences]);
  useEffect(() => { save("su_goal", dailyGoal); }, [dailyGoal]);
  useEffect(() => { save("su_dates", studyDates); }, [studyDates]);
  useEffect(() => { save("su_history", history.slice(0, 200)); }, [history]);
  useEffect(() => { save("su_done_today", { date: todayStr(), ids: doneToday }); }, [doneToday]);

  // ?? Queue ??????????????????????????????????????????????????????????????
  useEffect(() => {
    const q = buildQueue(sentences, dailyGoal);
    setQueueIds(q.map(s => s.id));
    setQIdx(0);
    reset();
  }, [dailyGoal]);

  const queue = queueIds.map(id => sentences.find(s => s.id === id)).filter(Boolean);
  const current = queue[qIdx] || null;
  currentRef.current = current;

  const isFirst = qIdx === 0;
  const isLast = queue.length === 0 || qIdx >= queue.length - 1;

  const todayDone = doneToday.length;
  const totalGoal = dailyGoal + extraGoal;
  const allDone = todayDone >= totalGoal;

  // ?? Speech ?????????????????????????????????????????????????????????????
  const speakKorean = useCallback(() => {
    if (!current) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(current.korean);
    u.lang = "ko-KR"; u.rate = 0.85;
    u.onstart = () => setPhase("speaking");
    u.onend = () => setPhase("listening_ready");
    window.speechSynthesis.speak(u);
  }, [current]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome?먯꽌留??뚯꽦?몄떇??媛?ν빐??"); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.continuous = false; rec.interimResults = false;
    transcriptRef.current = ""; evaluatedRef.current = false;
    rec.onstart = () => setPhase("listening");
    rec.onresult = (e) => { transcriptRef.current = e.results[0][0].transcript; };
    rec.onend = async () => {
      if (evaluatedRef.current) return;
      evaluatedRef.current = true;
      const t = transcriptRef.current;
      if (t) { setSpokenText(t); setPhase("evaluating"); await doEvalRef.current(t); }
      else setPhase("listening_ready");
    };
    rec.onerror = (e) => { if (e.error !== "aborted") { evaluatedRef.current = true; setPhase("listening_ready"); } };
    recRef.current = rec; rec.start();
  }, [current, retryCount]);

  const submitTyped = async () => {
    if (!typedText.trim()) return;
    const ans = typedText.trim();
    setSpokenText(ans); setPhase("evaluating");
    await doEvalRef.current(ans);
  };

  // ?? Evaluate ???????????????????????????????????????????????????????????
  const doEval = async (answer) => {
    const cur = currentRef.current;
    if (!cur) return;
    try {
      const raw = await callClaude(
        [{ role: "user", content: "Korean: \"" + cur.korean + "\"\nCorrect English: \"" + cur.english + "\"\nUser answered: \"" + answer + "\"" }],
        "You are a friendly English tutor. Evaluate Korean-to-English translation.\nRespond ONLY with valid JSON (no markdown):\n{\"score\":<0-100>,\"feedbackKo\":\"<1-2 sentences in Korean>\",\"correctionKo\":\"<correction in Korean or empty string>\",\"bestVersion\":\"<ideal English>\"}"
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const grade = getGrade(parsed.score);
      setEvalResult({ ...parsed, grade });
      setPhase("result");

      // SRS update
      const srsKey = grade === "?? ? "high" : grade === "以? ? "mid" : "low";
      const nextDate = addDays(SRS_DAYS[srsKey]);
      setSentences(s => s.map(x => x.id === cur.id ? { ...x, reviewCount: x.reviewCount + 1, nextReviewDate: nextDate, lastGrade: grade } : x));

      // Record done today
      if (!doneToday.includes(cur.id)) {
        const newDone = [...doneToday, cur.id];
        setDoneToday(newDone);
        const t = todayStr();
        if (!studyDates.includes(t)) setStudyDates(d => [...d, t]);
      }

      // History
      const entry = { id: Date.now(), sentenceId: cur.id, korean: cur.korean, english: cur.english, spoken: answer, grade, bestVersion: parsed.bestVersion, feedbackKo: parsed.feedbackKo, correctionKo: parsed.correctionKo, date: new Date().toISOString(), attempt: retryCount + 1 };
      setHistory(h => [entry, ...h]);
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      setEvalResult({ score: 0, grade: "??, feedbackKo: "?ㅻ쪟: " + msg, correctionKo: "", bestVersion: cur.english });
      setPhase("result");
    }
  };
  doEvalRef.current = doEval;

  // ?? Helpers ????????????????????????????????????????????????????????????
  const reset = () => { window.speechSynthesis.cancel(); setPhase("ready"); setSpokenText(""); setTypedText(""); setEvalResult(null); setRetryCount(0); };
  const retry = () => { setRetryCount(r => r + 1); setPhase("ready"); setSpokenText(""); setTypedText(""); setEvalResult(null); };
  const goNext = () => { if (qIdx < queue.length - 1) { setQIdx(i => i + 1); reset(); } };
  const goPrev = () => { if (qIdx > 0) { setQIdx(i => i - 1); reset(); } };
  const toggleBookmark = (id) => setSentences(s => s.map(x => x.id === id ? { ...x, bookmarked: !x.bookmarked } : x));
  const deleteSentence = (id) => setSentences(p => p.filter(s => s.id !== id));

  const refreshQueue = () => {
    const q = buildQueue(sentences, dailyGoal);
    setQueueIds(q.map(s => s.id));
    setQIdx(0); reset();
  };

  // ?? Auto-translate ?????????????????????????????????????????????????????
  const [translateError, setTranslateError] = useState("");
  const autoTranslate = async (dir) => {
    const text = dir === "ko" ? newEn : newKo;
    if (!text.trim()) return;
    setTranslating(dir);
    setTranslateError("");
    try {
      const raw = await callClaude(
        [{ role: "user", content: text.trim() }],
        dir === "ko"
          ? "Translate the following English sentence to natural Korean. Respond with ONLY the Korean translation, nothing else."
          : "Translate the following Korean sentence to natural English. Respond with ONLY the English translation, nothing else."
      );
      if (dir === "ko") setNewKo(raw.trim());
      else setNewEn(raw.trim());
    } catch (err) {
      setTranslateError("踰덉뿭 ?ㅻ쪟: " + (err && err.message ? err.message : String(err)));
    }
    setTranslating(null);
  };

  const addSentence = () => {
    if (!newKo.trim() || !newEn.trim()) return;
    setSentences(p => [...p, { id: Date.now(), korean: newKo.trim(), english: newEn.trim(), bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr() }]);
    setNewKo(""); setNewEn("");
  };

  const generateAI = async () => {
    const count = genCountCustom ? parseInt(genCountCustom) : genCount;
    if (!count || count < 1 || count > 50) { alert("1~50 ?ъ씠???レ옄瑜??낅젰?댁＜?몄슂."); return; }
    setGenerating(true);
    try {
      const raw = await callClaude(
        [{ role: "user", content: genTopic || "?ㅼ뼇???쇱긽 二쇱젣" }],
        "Generate exactly " + count + " Korean-English sentence pairs for translation practice. Vary difficulty levels.\nRespond ONLY with valid JSON array (no markdown): [{\"korean\":\"...\",\"english\":\"...\"},...]"
      );
      const arr = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSentences(p => [...p, ...arr.map((s, i) => ({ id: Date.now() + i, ...s, bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr() }))]);
      setGenTopic(""); setGenCountCustom("");
    } catch (err) { alert("?앹꽦 ?ㅻ쪟: " + (err && err.message ? err.message : "")); }
    setGenerating(false);
  };

  // ?쇨큵 ?띿뒪???낅젰 (?쒓뎅??| ?곸뼱 ?뺤떇)
  const addBulk = () => {
    setBulkError(""); setBulkSuccess("");
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l);
    const parsed = [];
    const failed = [];
    lines.forEach((line, i) => {
      const parts = line.split("|").map(p => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        parsed.push({ id: Date.now() + i, korean: parts[0], english: parts[1], bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr() });
      } else {
        failed.push(i + 1);
      }
    });
    if (parsed.length === 0) { setBulkError("?щ컮瑜??뺤떇???놁뼱?? '?쒓뎅??| English' ?뺤떇?쇰줈 ?낅젰?댁＜?몄슂."); return; }
    setSentences(p => [...p, ...parsed]);
    setBulkText("");
    setBulkSuccess(parsed.length + "媛?異붽??먯뼱??" + (failed.length > 0 ? " (" + failed.join(", ") + "踰?以??ㅻ쪟)" : ""));
    setTimeout(() => setBulkSuccess(""), 3000);
  };

  // CSV/?묒? ?뚯씪 ?낅줈??
  const handleCSV = (e) => {
    setCsvError(""); setCsvSuccess("");
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split("\n").map(l => l.trim()).filter(l => l);
      const parsed = [];
      const failed = [];
      const startIdx = (lines[0] && (lines[0].toLowerCase().includes("korean") || lines[0].toLowerCase().includes("?쒓뎅"))) ? 1 : 0;
      lines.slice(startIdx).forEach((line, i) => {
        const sep = line.includes("|") ? "|" : ",";
        const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ""));
        if (parts.length >= 2 && parts[0] && parts[1]) {
          parsed.push({ id: Date.now() + i, korean: parts[0], english: parts[1], bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr() });
        } else {
          failed.push(startIdx + i + 1);
        }
      });
      if (parsed.length === 0) { setCsvError("?뚯씪?먯꽌 臾몄옣??李얠? 紐삵뻽?댁슂. ?뺤떇???뺤씤?댁＜?몄슂."); return; }
      setSentences(p => [...p, ...parsed]);
      setCsvSuccess(parsed.length + "媛?異붽??먯뼱??" + (failed.length > 0 ? " (" + failed.join(", ") + "踰?以??ㅻ쪟)" : ""));
      setTimeout(() => setCsvSuccess(""), 3000);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  // ?? Shared styles ??????????????????????????????????????????????????????
  const card = { background: C.paper, borderRadius: 16, border: "1px solid " + C.border, padding: "20px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" };
  const mkBtn = (bg, color, border) => ({ width: "100%", padding: "14px", borderRadius: 12, border: border || "none", background: bg, color, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 });
  const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, boxSizing: "border-box", border: "1.5px solid " + C.border, background: C.bg, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, color: C.ink, outline: "none" };
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.muted, textTransform: "uppercase", marginBottom: 8, display: "block" };

  // Touch swipe
  const touchStartX = useRef(null);
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 60) { if (diff > 0) goNext(); else goPrev(); }
    touchStartX.current = null;
  };

  // ?? Practice View ??????????????????????????????????????????????????????
  const PracticeView = () => {
    // All done today
    if (allDone) return (
      <div style={{ textAlign: "center", padding: "50px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>?럦</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 8 }}>?ㅻ뒛 紐⑺몴 ?꾨즺!</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          {totalGoal}媛?臾몄옣??紐⑤몢 ??덉뼱?? ?섍퀬?덉뼱???삃
        </div>
        <div style={{ ...card, textAlign: "left", marginBottom: 14 }}>
          <span style={lbl}>?ㅻ뒛 寃곌낵</span>
          {["??,"以?,"??].map(g => {
            const cnt = history.filter(h => h.date.slice(0,10) === todayStr() && h.grade === g).length;
            return cnt > 0 ? (
              <div key={g} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.border }}>
                <GradeBadge grade={g} />
                <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.muted }}>{cnt}媛?/span>
              </div>
            ) : null;
          })}
        </div>

        {/* Extra practice */}
        <div style={{ ...card, textAlign: "left" }}>
          <span style={lbl}>??異붽? ?곗뒿</span>
          <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: C.muted, marginBottom: 12 }}>
            ???곗뒿?섍퀬 ?띠쑝硫?異붽? 臾몄옣 ?섎? ?좏깮?섏꽭??
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[5, 10, 15, 20].map(n => (
              <button key={n} onClick={() => {
                setExtraGoal(n);
                const q = buildQueue(sentences.filter(s => !doneToday.includes(s.id)), n);
                setQueueIds(q.map(s => s.id));
                setQIdx(0); reset();
              }} style={{ flex: 1, minWidth: 60, padding: "10px", borderRadius: 10, border: "1.5px solid " + C.border, background: C.bg, color: C.green, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                +{n}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

    if (!current) return (
      <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>?벊</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 16 }}>?ㅻ뒛 ? 臾몄옣???놁뼱??</div>
        <button style={{ ...mkBtn(C.green, "#fff"), width: "auto", padding: "12px 24px" }} onClick={refreshQueue}>???덈줈怨좎묠</button>
      </div>
    );

    return (
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Progress */}
        <div style={{ ...card, padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink }}>?ㅻ뒛 吏꾪뻾</span>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.muted }}>{todayDone} / {totalGoal}媛?/span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: Math.min(100, (todayDone / totalGoal) * 100) + "%", background: C.green, borderRadius: 3, transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, color: C.muted }}>{qIdx + 1} / {queue.length} 踰덉㎏ 臾몄옣</span>
            {current.nextReviewDate === null && <span style={{ fontSize: 10, background: C.orangeLight, color: C.orange, borderRadius: 8, padding: "2px 8px", fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 600 }}>??臾몄옣</span>}
            {current.lastGrade && <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono'", color: C.muted }}>?댁쟾: <GradeBadge grade={current.lastGrade} /></span>}
          </div>
        </div>

        {/* Sentence card */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {retryCount > 0 && <span style={{ fontSize: 11, color: C.orange, fontFamily: "'IBM Plex Mono'" }}>?щ룄??#{retryCount}</span>}
              {current.reviewCount > 0 && <span style={{ fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>?봺 {current.reviewCount}??/span>}
            </div>
            <button onClick={() => toggleBookmark(current.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: current.bookmarked ? "#e8a020" : C.border, padding: 0 }}>
              {current.bookmarked ? "?? : "??}
            </button>
          </div>
          <p style={{ fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1.55, margin: "0 0 18px", fontFamily: "'Nanum Gothic', sans-serif" }}>{current.korean}</p>
          <button style={mkBtn(C.greenLight, C.green, "1px solid " + C.green + "30")} onClick={speakKorean} disabled={phase === "speaking"}>
            {phase === "speaking" ? <><Waveform active /><span>?쎈뒗 以?..</span></> : <><span>?뵄</span><span>?쒓뎅???ｊ린</span></>}
          </button>
        </div>

        {/* Input */}
        {phase !== "result" && phase !== "evaluating" && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={lbl}>?곸뼱濡?踰덉뿭?댁꽌 ?듯븯?몄슂</span>
              <button onClick={() => setUseTyping(t => !t)} style={{ background: "none", border: "1px solid " + C.border, borderRadius: 8, padding: "4px 10px", fontSize: 12, color: C.muted, cursor: "pointer", fontFamily: "'Nanum Gothic', sans-serif" }}>
                {useTyping ? "?렎 ?뚯꽦?쇰줈" : "?⑨툘 ??댄븨?쇰줈"}
              </button>
            </div>
            {!useTyping ? (
              <>
                {(phase === "ready" || phase === "listening_ready") && <button style={mkBtn(C.orangeLight, C.orange, "1px solid " + C.orange + "40")} onClick={startListening}><span>?렎</span><span>留먰븯湲??쒖옉</span></button>}
                {phase === "processing" && <div style={{ textAlign: "center", color: C.muted, fontSize: 14, padding: "12px 0", fontFamily: "'Nanum Gothic', sans-serif" }}>?럺截??뚯꽦 泥섎━ 以?..</div>}
                {phase === "listening" && <button style={mkBtn("#fee2e2", "#991b1b", "1px solid #fca5a5")} onClick={() => { try { if (recRef.current) recRef.current.stop(); } catch(e){} setPhase("processing"); }}><Waveform active /><span>?ｋ뒗 以?.. (??븯硫?以묒?)</span></button>}
              </>
            ) : (
              <>
                <textarea value={typedText} onChange={e => setTypedText(e.target.value)} placeholder="?곸뼱 踰덉뿭???낅젰?섏꽭??.." rows={3} style={{ ...inp, resize: "none", marginBottom: 10 }} />
                <button style={mkBtn(C.green, "#fff")} onClick={submitTyped} disabled={!typedText.trim()}>?쒖텧?섍린</button>
              </>
            )}
          </div>
        )}

        {/* Evaluating */}
        {phase === "evaluating" && (
          <div style={{ ...card, textAlign: "center", padding: "28px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>??/div>
            <div style={{ color: C.muted, fontSize: 14, fontFamily: "'Nanum Gothic', sans-serif" }}>AI媛 ?됯? 以묒씠?먯슂...</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.green, marginTop: 10 }}>"{spokenText}"</div>
          </div>
        )}

        {/* Result */}
        {phase === "result" && evalResult && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid " + C.border }}>
              <GradeBadge grade={evalResult.grade} large />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.ink, fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 4 }}>
                  {evalResult.grade === "?? ? "?뚮??댁슂! ?럦" : evalResult.grade === "以? ? "???덉뼱?? ?몡" : "?ㅼ떆 ?꾩쟾?대킄???뮞"}
                </div>
                <div style={{ fontSize: 13, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>{evalResult.feedbackKo}</div>
              </div>
            </div>

            {evalResult.grade !== "?? && (
              <div style={{ background: C.greenLight, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.green, fontFamily: "'Nanum Gothic', sans-serif" }}>
                ?뱟 ?ㅼ쓬 蹂듭뒿: {evalResult.grade === "?? ? "7???? : "3????}
              </div>
            )}

            {evalResult.grade === "?? && (
              <div style={{ background: "#fff5f5", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14, fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 4 }}>?봽 ?щ룄?꾩씠 ?꾩슂?댁슂!</div>
                <div style={{ fontSize: 13, color: "#7f1d1d", fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>?댁씪 ?ㅼ떆 異쒖젣?쇱슂.</div>
              </div>
            )}

            <span style={lbl}>?닿? 留먰븳 寃?/span>
            <div style={{ background: "#f0f4ff", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #6366f1", marginBottom: 12 }}>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: "#3730a3" }}>"{spokenText}"</span>
            </div>

            <span style={lbl}>踰좎뒪??踰덉뿭</span>
            <div style={{ background: C.greenLight, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid " + C.green, marginBottom: evalResult.correctionKo ? 12 : 16 }}>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.green }}>{evalResult.bestVersion}</span>
            </div>

            {evalResult.correctionKo && (
              <>
                <span style={lbl}>援먯젙 ?ъ씤??/span>
                <div style={{ background: C.midBg, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid " + C.mid, marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: C.mid, fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>{evalResult.correctionKo}</span>
                </div>
              </>
            )}

            {evalResult.grade === "?? ? (
              <>
                <button style={mkBtn("#fee2e2", "#991b1b", "1.5px solid #fca5a5")} onClick={retry}>?봽 ?ㅼ떆 ?꾩쟾?섍린</button>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>??/button>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>??/button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1 }} onClick={reset}>?봽 ?ㅼ떆 ?쒕룄</button>
                  <button style={{ ...mkBtn(C.green, "#fff"), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>?ㅼ쓬 臾몄옣 ??/button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>??/button>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>??/button>
                </div>
              </>
            )}
          </div>
        )}

        {phase !== "result" && (
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>??/button>
            <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>??/button>
          </div>
        )}
      </div>
    );
  };

  // ?? History + Calendar View ????????????????????????????????????????????
  const HistoryView = () => {
    const gc = { ?? 0, 以? 0, ?? 0 };
    history.forEach(h => gc[h.grade]++);

    // Streak
    const sorted = [...studyDates].sort().reverse();
    let streak = 0;
    const today = todayStr();
    let check = today;
    for (const d of sorted) {
      if (d === check) { streak++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().slice(0, 10); }
      else if (d < check) break;
    }

    // Calendar
    const { y, m } = calMonth;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const monthNames = ["1??,"2??,"3??,"4??,"5??,"6??,"7??,"8??,"9??,"10??,"11??,"12??];
    const dayNames = ["??,"??,"??,"??,"紐?,"湲?,"??];

    return (
      <>
        {/* Streak + summary */}
        <div style={{ ...card, display: "flex", padding: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: "1px solid " + C.border }}>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Nanum Gothic', sans-serif", color: C.orange }}>{streak}</div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, color: C.muted, marginTop: 2 }}>?뵦 ?곗냽 ?숈뒿??/div>
          </div>
          {["??,"以?,"??].map((g, i) => (
            <div key={g} style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: i < 2 ? "1px solid " + C.border : "none" }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Nanum Gothic', sans-serif", color: g === "?? ? C.high : g === "以? ? C.mid : C.low, marginBottom: 4 }}>{gc[g]}</div>
              <GradeBadge grade={g} />
            </div>
          ))}
        </div>

        {/* Calendar */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>??/button>
            <span style={{ fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 700, fontSize: 16, color: C.ink }}>{y}??{monthNames[m]}</span>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>??/button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
            {dayNames.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono'", padding: "4px 0" }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array(firstDay).fill(null).map((_, i) => <div key={"e" + i} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day = i + 1;
              const mm = String(m + 1).padStart(2, "0");
              const dd = String(day).padStart(2, "0");
              const dateStr = y + "-" + mm + "-" + dd;
              const studied = studyDates.includes(dateStr);
              const isToday = dateStr === todayStr();
              return (
                <div key={day} style={{ textAlign: "center", padding: "6px 0", borderRadius: 8, background: studied ? C.green : isToday ? C.greenLight : "transparent", color: studied ? "#fff" : isToday ? C.green : C.ink, fontSize: 13, fontWeight: isToday ? 700 : 400, fontFamily: "'IBM Plex Mono'" }}>
                  {day}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14, fontSize: 11, fontFamily: "'Nanum Gothic', sans-serif", color: C.muted }}>
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.green, borderRadius: 3, verticalAlign: "middle", marginRight: 4 }} />?숈뒿 ?꾨즺</span>
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.greenLight, border: "1px solid " + C.green, borderRadius: 3, verticalAlign: "middle", marginRight: 4 }} />?ㅻ뒛</span>
          </div>
        </div>

        {/* History list */}
        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif" }}>?꾩쭅 湲곕줉???놁뼱?? ?곗뒿???쒖옉?대낫?몄슂!</div>
          </div>
        ) : history.map(h => (
          <div key={h.id} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GradeBadge grade={h.grade} />
                {h.attempt > 1 && <span style={{ fontSize: 11, color: C.orange, fontFamily: "'IBM Plex Mono'" }}>?щ룄??#{h.attempt}</span>}
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: C.muted }}>
                {new Date(h.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} {new Date(h.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{h.korean}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: "#6366f1", marginBottom: 3 }}>???? {h.spoken}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.green }}>?뺣떟: {h.bestVersion}</div>
          </div>
        ))}
      </>
    );
  };

  // ?? Manage View ????????????????????????????????????????????????????????
  const ManageView = () => {
    const manageTabs = [
      { key: "single", label: "??臾몄옣" },
      { key: "bulk", label: "?쇨큵 ?낅젰" },
      { key: "csv", label: "?뚯씪 ?낅줈?? },
      { key: "ai", label: "AI ?앹꽦" },
    ];
    return (
      <>
        {/* Daily goal */}
        <div style={card}>
          <span style={lbl}>?렞 ?섎（ 紐⑺몴 臾몄옣 ??/span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[5, 10, 15, 20, 30].map(n => (
              <button key={n} onClick={() => { setDailyGoal(n); setExtraGoal(0); }} style={{ flex: 1, minWidth: 44, padding: "12px 8px", borderRadius: 12, border: "1.5px solid " + (dailyGoal === n ? C.green : C.border), background: dailyGoal === n ? C.greenLight : C.bg, color: dailyGoal === n ? C.green : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>
            ?꾩옱 ?? 蹂듭뒿 ?꾩슂 {sentences.filter(s => s.nextReviewDate && s.nextReviewDate <= todayStr()).length}媛?쨌 ??臾몄옣 {sentences.filter(s => !s.nextReviewDate).length}媛?
          </div>
        </div>

        {/* Add sentence - tabbed */}
        <div style={card}>
          {/* Sub tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 18, background: C.bg, borderRadius: 10, padding: 4 }}>
            {manageTabs.map(t => (
              <button key={t.key} onClick={() => setManageTab(t.key)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 700, fontSize: 12, background: manageTab === t.key ? C.paper : "transparent", color: manageTab === t.key ? C.green : C.muted, boxShadow: manageTab === t.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Single */}
          {manageTab === "single" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={lbl}>?륅툘 ??臾몄옣??異붽?</span>
              <input style={inp} placeholder="?쒓뎅??臾몄옣" value={newKo} onChange={e => setNewKo(e.target.value)} />
              {newKo.trim() && (
                <button onClick={() => autoTranslate("en")} disabled={!!translating} style={mkBtn(C.orangeLight, C.orange, "1px solid " + C.orange + "40")}>
                  {translating === "en" ? "??踰덉뿭 以?.." : "???곸뼱濡??먮룞踰덉뿭"}
                </button>
              )}
              <input style={inp} placeholder="English translation" value={newEn} onChange={e => setNewEn(e.target.value)} />
              {newEn.trim() && (
                <button onClick={() => autoTranslate("ko")} disabled={!!translating} style={mkBtn(C.greenLight, C.green, "1px solid " + C.green + "30")}>
                  {translating === "ko" ? "??踰덉뿭 以?.." : "???쒓뎅?대줈 ?먮룞踰덉뿭"}
                </button>
              )}
              {translateError && <div style={{ fontSize: 12, color: C.low, fontFamily: "'Nanum Gothic', sans-serif", padding: "8px", background: C.lowBg, borderRadius: 8 }}>{translateError}</div>}
              <button style={mkBtn(C.green, "#fff")} onClick={addSentence} disabled={!newKo.trim() || !newEn.trim()}>+ 異붽??섍린</button>
            </div>
          )}

          {/* Bulk text */}
          {manageTab === "bulk" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={lbl}>?뱥 ?щ윭 臾몄옣 ??踰덉뿉 ?낅젰</span>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", background: C.bg, borderRadius: 8, padding: "10px 12px", lineHeight: 1.8 }}>
                ??以꾩뿉 ?섎굹?? <strong>?쒓뎅??| English</strong> ?뺤떇?쇰줈 ?낅젰?섏꽭??<br />
                ?? ????숈깮?댁뿉?? | I am a student.
              </div>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={"????숈깮?댁뿉?? | I am a student.\n?ㅻ뒛 ?좎뵪媛 醫뗭븘?? | The weather is nice today.\n諛곌? 怨좏뙆?? | I am hungry."}
                rows={8}
                style={{ ...inp, resize: "vertical", lineHeight: 1.7 }}
              />
              {bulkError && <div style={{ fontSize: 12, color: C.low, background: C.lowBg, borderRadius: 8, padding: "8px 12px" }}>{bulkError}</div>}
              {bulkSuccess && <div style={{ fontSize: 12, color: C.green, background: C.greenLight, borderRadius: 8, padding: "8px 12px" }}>{bulkSuccess}</div>}
              <button style={mkBtn(C.green, "#fff")} onClick={addBulk} disabled={!bulkText.trim()}>+ ?쇨큵 異붽??섍린</button>
            </div>
          )}

          {/* CSV upload */}
          {manageTab === "csv" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={lbl}>?뱚 CSV / ?묒? ?뚯씪 ?낅줈??/span>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", background: C.bg, borderRadius: 8, padding: "10px 12px", lineHeight: 1.8 }}>
                <strong>CSV ?먮뒗 ?묒?(.csv)</strong> ?뚯씪???낅줈?쒗븯?몄슂.<br />
                A?? ?쒓뎅??&nbsp;|&nbsp; B?? English<br />
                援щ텇?먮뒗 <strong>, (?쇳몴)</strong> ?먮뒗 <strong>| (?뚯씠??</strong> 紐⑤몢 吏?먰빐??<br />
                泥?以꾩씠 ?ㅻ뜑硫??먮룞?쇰줈 嫄대꼫?곗뼱??
              </div>
              <label style={{ ...mkBtn(C.greenLight, C.green, "1px solid " + C.green + "30"), cursor: "pointer", width: "auto", alignSelf: "flex-start", padding: "12px 24px" }}>
                ?뱛 ?뚯씪 ?좏깮?섍린
                <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display: "none" }} />
              </label>
              {csvError && <div style={{ fontSize: 12, color: C.low, background: C.lowBg, borderRadius: 8, padding: "8px 12px" }}>{csvError}</div>}
              {csvSuccess && <div style={{ fontSize: 12, color: C.green, background: C.greenLight, borderRadius: 8, padding: "8px 12px" }}>??{csvSuccess}</div>}
            </div>
          )}

          {/* AI generate */}
          {manageTab === "ai" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={lbl}>?쨼 AI 臾몄옣 ?먮룞 ?앹꽦</span>
              <input style={inp} placeholder="二쇱젣 ?낅젰 (?좏깮 쨌 ?? 鍮꾩쫰?덉뒪, ?ы뻾, ?쇱긽)" value={genTopic} onChange={e => setGenTopic(e.target.value)} />
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontFamily: "'Nanum Gothic', sans-serif" }}>?앹꽦??臾몄옣 ??/div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[5, 10, 20].map(n => (
                    <button key={n} onClick={() => { setGenCount(n); setGenCountCustom(""); }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid " + (genCount === n && !genCountCustom ? C.green : C.border), background: genCount === n && !genCountCustom ? C.greenLight : C.bg, color: genCount === n && !genCountCustom ? C.green : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                      {n}
                    </button>
                  ))}
                </div>
                <input style={{ ...inp, textAlign: "center" }} type="number" placeholder="吏곸젒 ?낅젰 (理쒕? 50)" value={genCountCustom} onChange={e => setGenCountCustom(e.target.value)} min={1} max={50} />
              </div>
              <button style={mkBtn(generating ? C.bg : C.orangeLight, generating ? C.muted : C.orange, "1px solid " + C.orange + "40")} onClick={generateAI} disabled={generating}>
                {generating ? "???앹꽦 以?.." : "??" + (genCountCustom || genCount) + "媛?臾몄옣 ?먮룞 ?앹꽦"}
              </button>
            </div>
          )}
        </div>

        {/* Sentence list */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={lbl}>?뱴 臾몄옣 紐⑸줉 ({sentences.length}媛?</span>
          </div>

          {/* Search */}
          <input
            style={{ ...inp, marginBottom: 10 }}
            placeholder="?뵇 寃??.."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "?꾩껜" },
              { key: "new", label: "??臾몄옣" },
              { key: "due", label: "蹂듭뒿 ?덉젙" },
              { key: "done", label: "?숈뒿 ?꾨즺" },
              { key: "bookmarked", label: "??利먭꺼李얘린" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilterStatus(f.key)} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid " + (filterStatus === f.key ? C.green : C.border), background: filterStatus === f.key ? C.greenLight : C.bg, color: filterStatus === f.key ? C.green : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Grouped list */}
          {(() => {
            const today = todayStr();
            const filtered = sentences.filter(s => {
              const matchSearch = !searchText || s.korean.includes(searchText) || s.english.toLowerCase().includes(searchText.toLowerCase());
              const matchFilter =
                filterStatus === "all" ? true :
                filterStatus === "new" ? !s.nextReviewDate :
                filterStatus === "due" ? (s.nextReviewDate && s.nextReviewDate <= today) :
                filterStatus === "done" ? (s.nextReviewDate && s.nextReviewDate > today) :
                filterStatus === "bookmarked" ? s.bookmarked : true;
              return matchSearch && matchFilter;
            });

            if (filtered.length === 0) return (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14 }}>
                寃??寃곌낵媛 ?놁뼱??
              </div>
            );

            const groups = filterStatus === "all" ? [
              { label: "??臾몄옣", items: filtered.filter(s => !s.nextReviewDate), color: C.orange, bg: C.orangeLight },
              { label: "蹂듭뒿 ?덉젙", items: filtered.filter(s => s.nextReviewDate && s.nextReviewDate <= today), color: "#991b1b", bg: "#fee2e2" },
              { label: "?숈뒿 ?꾨즺", items: filtered.filter(s => s.nextReviewDate && s.nextReviewDate > today), color: C.green, bg: C.greenLight },
            ] : [{ label: null, items: filtered }];

            return groups.map(group => (
              group.items.length === 0 ? null :
              <div key={group.label || "all"} style={{ marginBottom: 14 }}>
                {group.label && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: group.bg, color: group.color, borderRadius: 8, padding: "2px 10px", fontFamily: "'Nanum Gothic', sans-serif" }}>{group.label}</span>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>{group.items.length}媛?/span>
                  </div>
                )}
                {group.items.map((s, i) => (
                  <div key={s.id} style={{ borderRadius: 12, border: "1px solid " + C.border, marginBottom: 6, overflow: "hidden", background: C.paper }}>
                    {/* Row header - always visible */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", cursor: "pointer" }} onClick={() => toggleExpand(s.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.korean}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {s.bookmarked && <span style={{ fontSize: 13, color: "#e8a020" }}>??/span>}
                        {s.lastGrade && <GradeBadge grade={s.lastGrade} />}
                        <span style={{ fontSize: 13, color: C.muted }}>{expandedIds[s.id] ? "?? : "??}</span>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {expandedIds[s.id] && (
                      <div style={{ padding: "0 14px 14px", borderTop: "1px solid " + C.border }}>
                        <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.green, marginTop: 10, marginBottom: 8 }}>{s.english}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {s.addedDate && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>?뱟 ?깅줉 {s.addedDate}</span>}
                          {s.nextReviewDate && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>?봽 蹂듭뒿 {s.nextReviewDate}</span>}
                          {s.reviewCount > 0 && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>?봺 {s.reviewCount}??/span>}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => toggleBookmark(s.id)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid " + C.border, background: s.bookmarked ? "#fef9e7" : C.bg, color: s.bookmarked ? "#e8a020" : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            {s.bookmarked ? "??利먭꺼李얘린 ?댁젣" : "??利먭꺼李얘린"}
                          </button>
                          <button onClick={() => deleteSentence(s.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff5f5", color: "#991b1b", fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            ??젣
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
      </>
    );
  };

  // ?? Render ?????????????????????????????????????????????????????????????
  const tabs = [
    { key: "practice", label: "?곗뒿" },
    { key: "history", label: "湲곕줉" },
    { key: "manage", label: "愿由? },
  ];

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href={FONTS} rel="stylesheet" />
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ background: C.paper, borderBottom: "1px solid " + C.border, padding: "20px 24px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: "-0.5px" }}>
              Speak<span style={{ color: C.orange }}>Up</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: C.muted, textAlign: "right" }}>
              {sentences.length}臾몄옣 쨌 ?뵦{(() => {
                const sorted = [...studyDates].sort().reverse();
                let s = 0; let check = todayStr();
                for (const d of sorted) { if (d === check) { s++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().slice(0, 10); } else if (d < check) break; }
                return s;
              })()}???곗냽
            </div>
          </div>
          <div style={{ display: "flex", borderBottom: "2px solid " + C.border }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setView(t.key)} style={{ flex: 1, padding: "14px 0", border: "none", cursor: "pointer", fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 600, fontSize: 14, background: "none", color: view === t.key ? C.green : C.muted, borderBottom: view === t.key ? "3px solid " + C.green : "3px solid transparent", marginBottom: -2, transition: "all 0.2s" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
          {view === "practice" && PracticeView()}
          {view === "history" && HistoryView()}
          {view === "manage" && ManageView()}
        </div>
      </div>
    </>
  );
}
