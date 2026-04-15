import { useState, useRef, useCallback, useEffect } from "react";

const FONTS = "https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";

const THEMES = {
  sage: {
    name: "🌿 세이지 그린",
    bg: "#f0f4f0", paper: "#fafcfa", green: "#2d6a4f", greenLight: "#d8ead8",
    orange: "#d4a017", orangeLight: "#fef9e7", ink: "#1a2e1a", muted: "#5a7a5a",
    border: "#c8dfc8", high: "#2d6a4f", highBg: "#d8ead8",
    mid: "#92400e", midBg: "#fef3c7", low: "#991b1b", lowBg: "#fee2e2",
  },
  cream: {
    name: "🌾 크림",
    bg: "#f5f0e8", paper: "#fffdf9", green: "#1b4332", greenLight: "#e9f5ee",
    orange: "#c84b0f", orangeLight: "#fdf0ea", ink: "#1a1a1a", muted: "#7a7060",
    border: "#e2ddd4", high: "#1b4332", highBg: "#e9f5ee",
    mid: "#92400e", midBg: "#fef3c7", low: "#991b1b", lowBg: "#fee2e2",
  },
  darkGreen: {
    name: "🌙 다크 그린",
    bg: "#0d1f17", paper: "#142b1f", green: "#4ade80", greenLight: "#14532d",
    orange: "#fb923c", orangeLight: "#431407", ink: "#f0fdf4", muted: "#86efac",
    border: "#1e3a2b", high: "#4ade80", highBg: "#14532d",
    mid: "#fbbf24", midBg: "#451a03", low: "#f87171", lowBg: "#450a0a",
  },
  navy: {
    name: "🌊 네이비 블루",
    bg: "#0f172a", paper: "#1e293b", green: "#38bdf8", greenLight: "#0c4a6e",
    orange: "#f472b6", orangeLight: "#500724", ink: "#f8fafc", muted: "#94a3b8",
    border: "#334155", high: "#38bdf8", highBg: "#0c4a6e",
    mid: "#fbbf24", midBg: "#451a03", low: "#f87171", lowBg: "#450a0a",
  },
  pink: {
    name: "🌸 소프트 핑크",
    bg: "#fff1f5", paper: "#ffffff", green: "#be185d", greenLight: "#fce7f3",
    orange: "#f59e0b", orangeLight: "#fef3c7", ink: "#1f0010", muted: "#9d4b72",
    border: "#fecdd3", high: "#be185d", highBg: "#fce7f3",
    mid: "#92400e", midBg: "#fef3c7", low: "#991b1b", lowBg: "#fee2e2",
  },
  mono: {
    name: "🪨 모노크롬",
    bg: "#f4f4f4", paper: "#ffffff", green: "#111111", greenLight: "#e5e5e5",
    orange: "#555555", orangeLight: "#f5f5f5", ink: "#111111", muted: "#888888",
    border: "#dddddd", high: "#111111", highBg: "#e5e5e5",
    mid: "#555555", midBg: "#f5f5f5", low: "#991b1b", lowBg: "#fee2e2",
  },
};

let C = THEMES.sage;

const SRS_DAYS = { high: 7, mid: 3, low: 1 };
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue(sentences, goal) {
  const learnedSents = sentences.filter(s => s.learned);
  const never = shuffle(learnedSents.filter(s => !s.nextReviewDate));
  const due = shuffle(learnedSents.filter(s => s.nextReviewDate && s.nextReviewDate <= todayStr()));
  return [...never, ...due].slice(0, goal);
}

const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

const INITIAL_SENTENCES = [
  { id: 1, korean: "저는 매일 아침 일찍 일어나요.", english: "I wake up early every morning.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01", learned: false },
  { id: 2, korean: "오늘 회의가 세 시에 있어요.", english: "I have a meeting at three o'clock today.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01", learned: false },
  { id: 3, korean: "이 프로젝트는 다음 달까지 완료해야 해요.", english: "This project needs to be completed by next month.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01", learned: false },
  { id: 4, korean: "날씨가 좋으면 공원에 산책하러 갈게요.", english: "If the weather is nice, I'll go for a walk in the park.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: "2026-01-01", learned: false },
];

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
  if (score >= 75) return "상";
  if (score >= 45) return "중";
  return "하";
}

function GradeBadge({ grade, large }) {
  const size = large ? { fontSize: 20, padding: "7px 20px", borderRadius: 28 } : { fontSize: 11, padding: "3px 9px", borderRadius: 16 };
  const bg = grade === "상" ? C.highBg : grade === "중" ? C.midBg : C.lowBg;
  const color = grade === "상" ? C.high : grade === "중" ? C.mid : C.low;
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

export default function App() {
  const [themeKey, setThemeKey] = useState(() => load("su_theme", "sage"));
  C = THEMES[themeKey] || THEMES.sage;

  const [view, setView] = useState("study");
  const [sentences, setSentences] = useState(() => load("su_sentences", INITIAL_SENTENCES));
  const [dailyGoal, setDailyGoal] = useState(() => load("su_goal", 5));
  const [extraGoal, setExtraGoal] = useState(0);
  const [studyDates, setStudyDates] = useState(() => load("su_dates", []));
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
  const [translateError, setTranslateError] = useState("");
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
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedIds, setExpandedIds] = useState({});
  const [listPage, setListPage] = useState(0);
  const toggleExpand = (id) => setExpandedIds(p => ({ ...p, [id]: !p[id] }));

  const recRef = useRef(null);
  const transcriptRef = useRef("");
  const evaluatedRef = useRef(false);
  const doEvalRef = useRef(null);
  const currentRef = useRef(null);

  // Persist
  useEffect(() => { save("su_sentences", sentences); }, [sentences]);
  useEffect(() => { save("su_goal", dailyGoal); }, [dailyGoal]);
  useEffect(() => { save("su_dates", studyDates); }, [studyDates]);
  useEffect(() => { save("su_history", history.slice(0, 200)); }, [history]);
  useEffect(() => { save("su_done_today", { date: todayStr(), ids: doneToday }); }, [doneToday]);
  useEffect(() => { save("su_theme", themeKey); }, [themeKey]);

  // Queue
  useEffect(() => {
    const q = buildQueue(sentences, dailyGoal);
    setQueueIds(q.map(s => s.id));
    setQIdx(0);
    reset();
  }, [dailyGoal, sentences]);

  const queue = queueIds.map(id => sentences.find(s => s.id === id)).filter(Boolean);
  const current = queue[qIdx] || null;
  currentRef.current = current;

  const isFirst = qIdx === 0;
  const isLast = queue.length === 0 || qIdx >= queue.length - 1;
  const todayDone = doneToday.length;
  const totalGoal = dailyGoal + extraGoal;
  const allDone = todayDone >= totalGoal;

  // Speech
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
    if (!SR) { alert("Chrome에서만 음성인식이 가능해요."); return; }
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

      const srsKey = grade === "상" ? "high" : grade === "중" ? "mid" : "low";
      const nextDate = addDays(SRS_DAYS[srsKey]);
      setSentences(s => s.map(x => x.id === cur.id ? {
        ...x,
        reviewCount: x.reviewCount + 1,
        nextReviewDate: nextDate,
        lastGrade: grade,
        learned: grade === "하" ? false : x.learned,
      } : x));

      if (!doneToday.includes(cur.id)) {
        const newDone = [...doneToday, cur.id];
        setDoneToday(newDone);
        const t = todayStr();
        if (!studyDates.includes(t)) setStudyDates(d => [...d, t]);
      }

      const entry = { id: Date.now(), sentenceId: cur.id, korean: cur.korean, english: cur.english, spoken: answer, grade, bestVersion: parsed.bestVersion, feedbackKo: parsed.feedbackKo, correctionKo: parsed.correctionKo, date: new Date().toISOString(), attempt: retryCount + 1 };
      setHistory(h => [entry, ...h]);
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      setEvalResult({ score: 0, grade: "하", feedbackKo: "오류: " + msg, correctionKo: "", bestVersion: cur.english });
      setPhase("result");
    }
  };
  doEvalRef.current = doEval;

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

  const autoTranslate = async (dir) => {
    const text = dir === "ko" ? newEn : newKo;
    if (!text.trim()) return;
    setTranslating(dir); setTranslateError("");
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
      setTranslateError("번역 오류: " + (err && err.message ? err.message : String(err)));
    }
    setTranslating(null);
  };

  const addSentence = () => {
    if (!newKo.trim() || !newEn.trim()) return;
    setSentences(p => [...p, { id: Date.now(), korean: newKo.trim(), english: newEn.trim(), bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr(), learned: false }]);
    setNewKo(""); setNewEn("");
  };

  const generateAI = async () => {
    const count = genCountCustom ? parseInt(genCountCustom) : genCount;
    if (!count || count < 1 || count > 50) { alert("1~50 사이의 숫자를 입력해주세요."); return; }
    setGenerating(true);
    try {
      const raw = await callClaude(
        [{ role: "user", content: genTopic || "다양한 일상 주제" }],
        "Generate exactly " + count + " Korean-English sentence pairs for translation practice. Vary difficulty levels.\nRespond ONLY with valid JSON array (no markdown): [{\"korean\":\"...\",\"english\":\"...\"},...]"
      );
      const arr = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSentences(p => [...p, ...arr.map((s, i) => ({ id: Date.now() + i, ...s, bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr(), learned: false }))]);
      setGenTopic(""); setGenCountCustom("");
    } catch (err) { alert("생성 오류: " + (err && err.message ? err.message : "")); }
    setGenerating(false);
  };

  const addBulk = () => {
    setBulkError(""); setBulkSuccess("");
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l);
    const parsed = []; const failed = [];
    lines.forEach((line, i) => {
      const parts = line.split("|").map(p => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        parsed.push({ id: Date.now() + i, korean: parts[0], english: parts[1], bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr(), learned: false });
      } else { failed.push(i + 1); }
    });
    if (parsed.length === 0) { setBulkError("올바른 형식이 없어요. '한국어 | English' 형식으로 입력해주세요."); return; }
    setSentences(p => [...p, ...parsed]);
    setBulkText("");
    setBulkSuccess(parsed.length + "개 추가됐어요!" + (failed.length > 0 ? " (" + failed.join(", ") + "번 줄 오류)" : ""));
    setTimeout(() => setBulkSuccess(""), 3000);
  };

  const handleCSV = (e) => {
    setCsvError(""); setCsvSuccess("");
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split("\n").map(l => l.trim()).filter(l => l);
      const parsed = []; const failed = [];
      const startIdx = (lines[0] && (lines[0].toLowerCase().includes("korean") || lines[0].toLowerCase().includes("한국"))) ? 1 : 0;
      lines.slice(startIdx).forEach((line, i) => {
        const sep = line.includes("|") ? "|" : ",";
        const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ""));
        if (parts.length >= 2 && parts[0] && parts[1]) {
          parsed.push({ id: Date.now() + i, korean: parts[0], english: parts[1], bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null, addedDate: todayStr(), learned: false });
        } else { failed.push(startIdx + i + 1); }
      });
      if (parsed.length === 0) { setCsvError("파일에서 문장을 찾지 못했어요."); return; }
      setSentences(p => [...p, ...parsed]);
      setCsvSuccess(parsed.length + "개 추가됐어요!" + (failed.length > 0 ? " (" + failed.join(", ") + "번 줄 오류)" : ""));
      setTimeout(() => setCsvSuccess(""), 3000);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  // Shared styles
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

  // ── Study View ──────────────────────────────────────────────────────────
  const StudyView = () => {
    const unlearned = sentences.filter(s => !s.learned);
    const learnedAll = sentences.filter(s => s.learned);

    if (sentences.length === 0) return (
      <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 16 }}>관리 탭에서 문장을 추가해주세요!</div>
        <button style={{ ...mkBtn(C.green, "#fff"), width: "auto", padding: "12px 24px" }} onClick={() => setView("manage")}>관리 탭으로 이동</button>
      </div>
    );

    return (
      <>
        {/* 요약 */}
        <div style={{ ...card, display: "flex", padding: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: "1px solid " + C.border }}>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Nanum Gothic', sans-serif", color: C.orange }}>{unlearned.length}</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", marginTop: 2 }}>학습 필요</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", padding: "18px 0" }}>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Nanum Gothic', sans-serif", color: C.green }}>{learnedAll.length}</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", marginTop: 2 }}>학습 완료</div>
          </div>
        </div>

        {/* 학습 필요 목록 */}
        {unlearned.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "32px" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 8 }}>모든 문장을 학습했어요!</div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: C.muted, marginBottom: 20 }}>연습 탭에서 문제를 풀어보세요.</div>
            <button style={{ ...mkBtn(C.green, "#fff"), width: "auto", padding: "12px 24px" }} onClick={() => setView("practice")}>연습 탭으로 이동</button>
          </div>
        ) : (
          <div style={card}>
            <span style={lbl}>📖 암기할 문장 ({unlearned.length}개)</span>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 14, lineHeight: 1.7 }}>
              문장을 보고 외웠으면 <strong>✓ 완료</strong> 버튼을 탭하세요.<br />
              연습에서 틀리면 다시 여기에 나타나요.
            </div>
            {unlearned.map(s => (
              <div key={s.id} style={{ borderRadius: 12, border: "1px solid " + C.border, marginBottom: 10, background: C.paper, padding: "16px" }}>
                {s.lastGrade === "하" && (
                  <div style={{ display: "inline-block", fontSize: 10, background: C.lowBg, color: C.low, borderRadius: 6, padding: "2px 8px", fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 700, marginBottom: 8 }}>
                    🔄 틀린 문장
                  </div>
                )}
                <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 8, lineHeight: 1.5, wordBreak: "keep-all" }}>{s.korean}</div>
                <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: C.green, marginBottom: 14, lineHeight: 1.5 }}>{s.english}</div>
                <button
                  onClick={() => setSentences(prev => prev.map(x => x.id === s.id ? { ...x, learned: true } : x))}
                  style={{ ...mkBtn(C.greenLight, C.green, "1px solid " + C.green + "30"), width: "auto", padding: "10px 24px" }}
                >
                  ✓ 완료
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 학습 완료 목록 */}
        {learnedAll.length > 0 && (
          <div style={card}>
            <span style={lbl}>✅ 학습 완료 ({learnedAll.length}개)</span>
            {learnedAll.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: "1px solid " + C.border }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 3, wordBreak: "keep-all" }}>{s.korean}</div>
                  <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, color: C.muted }}>{s.english}</div>
                </div>
                <button
                  onClick={() => setSentences(prev => prev.map(x => x.id === s.id ? { ...x, learned: false } : x))}
                  style={{ background: "none", border: "1px solid " + C.border, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: C.muted, cursor: "pointer", fontFamily: "'Nanum Gothic', sans-serif", flexShrink: 0 }}
                >
                  취소
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  // ── Practice View ───────────────────────────────────────────────────────
  const PracticeView = () => {
    if (allDone) return (
      <div style={{ textAlign: "center", padding: "50px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 8 }}>오늘 목표 완료!</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          {totalGoal}개 문장을 모두 풀었어요. 수고했어요 😊
        </div>
        <div style={{ ...card, textAlign: "left", marginBottom: 14 }}>
          <span style={lbl}>오늘 결과</span>
          {["상","중","하"].map(g => {
            const cnt = history.filter(h => h.date.slice(0,10) === todayStr() && h.grade === g).length;
            return cnt > 0 ? (
              <div key={g} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.border }}>
                <GradeBadge grade={g} />
                <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.muted }}>{cnt}개</span>
              </div>
            ) : null;
          })}
        </div>
        <div style={{ ...card, textAlign: "left" }}>
          <span style={lbl}>➕ 추가 연습</span>
          <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: C.muted, marginBottom: 12 }}>더 연습하고 싶으면 추가 문장 수를 선택하세요!</div>
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
        <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 8 }}>연습할 문장이 없어요!</div>
        <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
          학습 탭에서 문장을 외운 후<br />연습을 시작해보세요 😊
        </div>
        <button style={{ ...mkBtn(C.green, "#fff"), width: "auto", padding: "12px 24px" }} onClick={() => setView("study")}>학습 탭으로 이동</button>
      </div>
    );

    return (
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Progress */}
        <div style={{ ...card, padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink }}>오늘 진행</span>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.muted }}>{todayDone} / {totalGoal}개</span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: Math.min(100, (todayDone / totalGoal) * 100) + "%", background: C.green, borderRadius: 3, transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, color: C.muted }}>{qIdx + 1} / {queue.length} 번째 문장</span>
            {current.lastGrade && <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono'", color: C.muted }}>이전: <GradeBadge grade={current.lastGrade} /></span>}
          </div>
        </div>

        {/* Sentence card */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {retryCount > 0 && <span style={{ fontSize: 11, color: C.orange, fontFamily: "'IBM Plex Mono'" }}>재도전 #{retryCount}</span>}
              {current.reviewCount > 0 && <span style={{ fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>🔁 {current.reviewCount}회</span>}
            </div>
            <button onClick={() => toggleBookmark(current.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: current.bookmarked ? "#e8a020" : C.border, padding: 0 }}>
              {current.bookmarked ? "★" : "☆"}
            </button>
          </div>
          <p style={{ fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1.55, margin: "0 0 18px", fontFamily: "'Nanum Gothic', sans-serif", wordBreak: "keep-all" }}>{current.korean}</p>
          <button style={mkBtn(C.greenLight, C.green, "1px solid " + C.green + "30")} onClick={speakKorean} disabled={phase === "speaking"}>
            {phase === "speaking" ? <><Waveform active /><span>읽는 중...</span></> : <><span>🔊</span><span>한국어 듣기</span></>}
          </button>
        </div>

        {/* Input */}
        {phase !== "result" && phase !== "evaluating" && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={lbl}>영어로 번역해서 답하세요</span>
              <button onClick={() => setUseTyping(t => !t)} style={{ background: "none", border: "1px solid " + C.border, borderRadius: 8, padding: "4px 10px", fontSize: 12, color: C.muted, cursor: "pointer", fontFamily: "'Nanum Gothic', sans-serif" }}>
                {useTyping ? "🎤 음성으로" : "⌨️ 타이핑으로"}
              </button>
            </div>
            {!useTyping ? (
              <>
                {(phase === "ready" || phase === "listening_ready") && <button style={mkBtn(C.orangeLight, C.orange, "1px solid " + C.orange + "40")} onClick={startListening}><span>🎤</span><span>말하기 시작</span></button>}
                {phase === "processing" && <div style={{ textAlign: "center", color: C.muted, fontSize: 14, padding: "12px 0", fontFamily: "'Nanum Gothic', sans-serif" }}>🎙️ 음성 처리 중...</div>}
                {phase === "listening" && <button style={mkBtn("#fee2e2", "#991b1b", "1px solid #fca5a5")} onClick={() => { try { if (recRef.current) recRef.current.stop(); } catch(e){} setPhase("processing"); }}><Waveform active /><span>듣는 중... (탭하면 중지)</span></button>}
              </>
            ) : (
              <>
                <textarea value={typedText} onChange={e => setTypedText(e.target.value)} placeholder="영어 번역을 입력하세요..." rows={3} style={{ ...inp, resize: "none", marginBottom: 10 }} />
                <button style={mkBtn(C.green, "#fff")} onClick={submitTyped} disabled={!typedText.trim()}>제출하기</button>
              </>
            )}
          </div>
        )}

        {/* Evaluating */}
        {phase === "evaluating" && (
          <div style={{ ...card, textAlign: "center", padding: "28px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
            <div style={{ color: C.muted, fontSize: 14, fontFamily: "'Nanum Gothic', sans-serif" }}>AI가 평가 중이에요...</div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: C.green, marginTop: 10 }}>"{spokenText}"</div>
          </div>
        )}

        {/* Result */}
        {phase === "result" && evalResult && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid " + C.border }}>
              <GradeBadge grade={evalResult.grade} large />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.ink, fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 4 }}>
                  {evalResult.grade === "상" ? "훌륭해요! 🎉" : evalResult.grade === "중" ? "잘 했어요! 👏" : "다시 도전해봐요 💪"}
                </div>
                <div style={{ fontSize: 13, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>{evalResult.feedbackKo}</div>
              </div>
            </div>

            {evalResult.grade !== "하" && (
              <div style={{ background: C.greenLight, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.green, fontFamily: "'Nanum Gothic', sans-serif" }}>
                📅 다음 복습: {evalResult.grade === "상" ? "7일 후" : "3일 후"}
              </div>
            )}

            {evalResult.grade === "하" && (
              <div style={{ background: "#fff5f5", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14, fontFamily: "'Nanum Gothic', sans-serif", marginBottom: 4 }}>🔄 학습 탭으로 돌아갔어요!</div>
                <div style={{ fontSize: 13, color: "#7f1d1d", fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>다시 암기하고 연습해보세요.</div>
              </div>
            )}

            <span style={lbl}>내가 말한 것</span>
            <div style={{ background: "#f0f4ff", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #6366f1", marginBottom: 12 }}>
              <span style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: "#3730a3" }}>"{spokenText}"</span>
            </div>

            <span style={lbl}>베스트 번역</span>
            <div style={{ background: C.greenLight, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid " + C.green, marginBottom: evalResult.correctionKo ? 12 : 16 }}>
              <span style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 13, color: C.green }}>{evalResult.bestVersion}</span>
            </div>

            {evalResult.correctionKo && (
              <>
                <span style={lbl}>교정 포인트</span>
                <div style={{ background: C.midBg, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid " + C.mid, marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: C.mid, fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>{evalResult.correctionKo}</span>
                </div>
              </>
            )}

            {evalResult.grade === "하" ? (
              <>
                <button style={mkBtn("#fee2e2", "#991b1b", "1.5px solid #fca5a5")} onClick={retry}>🔄 다시 도전하기</button>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>←</button>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>→</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1 }} onClick={reset}>🔄 다시 시도</button>
                  <button style={{ ...mkBtn(C.green, "#fff"), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>다음 문장 →</button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>←</button>
                  <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>→</button>
                </div>
              </>
            )}
          </div>
        )}

        {phase !== "result" && (
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>←</button>
            <button style={{ ...mkBtn(C.bg, C.muted, "1px solid " + C.border), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>→</button>
          </div>
        )}
      </div>
    );
  };

  // ── History View ────────────────────────────────────────────────────────
  const HistoryView = () => {
    const gc = { 상: 0, 중: 0, 하: 0 };
    history.forEach(h => gc[h.grade]++);

    const sorted = [...studyDates].sort().reverse();
    let streak = 0; const today = todayStr(); let check = today;
    for (const d of sorted) {
      if (d === check) { streak++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().slice(0, 10); }
      else if (d < check) break;
    }

    const { y, m } = calMonth;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const monthNames = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
    const dayNames = ["일","월","화","수","목","금","토"];

    return (
      <>
        <div style={{ ...card, display: "flex", padding: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: "1px solid " + C.border }}>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Nanum Gothic', sans-serif", color: C.orange }}>{streak}</div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, color: C.muted, marginTop: 2 }}>🔥 연속 학습일</div>
          </div>
          {["상","중","하"].map((g, i) => (
            <div key={g} style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: i < 2 ? "1px solid " + C.border : "none" }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Nanum Gothic', sans-serif", color: g === "상" ? C.high : g === "중" ? C.mid : C.low, marginBottom: 4 }}>{gc[g]}</div>
              <GradeBadge grade={g} />
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>‹</button>
            <span style={{ fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 700, fontSize: 16, color: C.ink }}>{y}년 {monthNames[m]}</span>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>›</button>
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
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.green, borderRadius: 3, verticalAlign: "middle", marginRight: 4 }} />학습 완료</span>
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.greenLight, border: "1px solid " + C.green, borderRadius: 3, verticalAlign: "middle", marginRight: 4 }} />오늘</span>
          </div>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif" }}>아직 기록이 없어요. 연습을 시작해보세요!</div>
          </div>
        ) : history.map(h => (
          <div key={h.id} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GradeBadge grade={h.grade} />
                {h.attempt > 1 && <span style={{ fontSize: 11, color: C.orange, fontFamily: "'IBM Plex Mono'" }}>재도전 #{h.attempt}</span>}
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: C.muted }}>
                {new Date(h.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} {new Date(h.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4, wordBreak: "keep-all" }}>{h.korean}</div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, color: "#6366f1", marginBottom: 3 }}>내 답: {h.spoken}</div>
            <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, color: C.green }}>정답: {h.bestVersion}</div>
          </div>
        ))}
      </>
    );
  };

  // ── Manage View ─────────────────────────────────────────────────────────
  const ManageView = () => {
    const manageTabs = [
      { key: "single", label: "한 문장" },
      { key: "bulk", label: "일괄 입력" },
      { key: "csv", label: "파일 업로드" },
      { key: "ai", label: "AI 생성" },
    ];
    const PAGE_SIZE = 10;
    const today = todayStr();
    const filtered = sentences.filter(s => {
      const matchSearch = !searchText || s.korean.includes(searchText) || s.english.toLowerCase().includes(searchText.toLowerCase());
      const matchFilter =
        filterStatus === "all" ? true :
        filterStatus === "new" ? !s.nextReviewDate :
        filterStatus === "due" ? (s.nextReviewDate && s.nextReviewDate <= today) :
        filterStatus === "done" ? (s.nextReviewDate && s.nextReviewDate > today) :
        filterStatus === "bookmarked" ? s.bookmarked :
        filterStatus === "unlearned" ? !s.learned : true;
      return matchSearch && matchFilter;
    });
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paged = filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
    const groups = filterStatus === "all" ? [
      { label: "학습 필요", items: paged.filter(s => !s.learned), color: C.orange, bg: C.orangeLight },
      { label: "새 문장 (학습완료)", items: paged.filter(s => s.learned && !s.nextReviewDate), color: C.green, bg: C.greenLight },
      { label: "복습 예정", items: paged.filter(s => s.learned && s.nextReviewDate && s.nextReviewDate <= today), color: C.low, bg: C.lowBg },
      { label: "학습 완료", items: paged.filter(s => s.learned && s.nextReviewDate && s.nextReviewDate > today), color: C.mid, bg: C.midBg },
    ] : [{ label: null, items: paged }];

    return (
      <>
        {/* Daily goal */}
        <div style={card}>
          <span style={lbl}>🎯 하루 목표 문장 수</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[5, 10, 15, 20, 30].map(n => (
              <button key={n} onClick={() => { setDailyGoal(n); setExtraGoal(0); }} style={{ flex: 1, minWidth: 44, padding: "12px 8px", borderRadius: 12, border: "1.5px solid " + (dailyGoal === n ? C.green : C.border), background: dailyGoal === n ? C.greenLight : C.bg, color: dailyGoal === n ? C.green : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", lineHeight: 1.6 }}>
            학습완료: {sentences.filter(s => s.learned).length}개 · 학습필요: {sentences.filter(s => !s.learned).length}개
          </div>
        </div>

        {/* Add sentence */}
        <div style={card}>
          <div style={{ display: "flex", gap: 0, marginBottom: 18, background: C.bg, borderRadius: 10, padding: 4 }}>
            {manageTabs.map(t => (
              <button key={t.key} onClick={() => setManageTab(t.key)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 700, fontSize: 12, background: manageTab === t.key ? C.paper : "transparent", color: manageTab === t.key ? C.green : C.muted, boxShadow: manageTab === t.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>
                {t.label}
              </button>
            ))}
          </div>

          {manageTab === "single" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={lbl}>✏️ 한 문장씩 추가</span>
              <input style={inp} placeholder="한국어 문장" value={newKo} onChange={e => setNewKo(e.target.value)} />
              {newKo.trim() && (
                <button onClick={() => autoTranslate("en")} disabled={!!translating} style={mkBtn(C.orangeLight, C.orange, "1px solid " + C.orange + "40")}>
                  {translating === "en" ? "⏳ 번역 중..." : "✨ 영어로 자동번역"}
                </button>
              )}
              <input style={inp} placeholder="English translation" value={newEn} onChange={e => setNewEn(e.target.value)} />
              {newEn.trim() && (
                <button onClick={() => autoTranslate("ko")} disabled={!!translating} style={mkBtn(C.greenLight, C.green, "1px solid " + C.green + "30")}>
                  {translating === "ko" ? "⏳ 번역 중..." : "✨ 한국어로 자동번역"}
                </button>
              )}
              {translateError && <div style={{ fontSize: 12, color: C.low, padding: "8px", background: C.lowBg, borderRadius: 8 }}>{translateError}</div>}
              <button style={mkBtn(C.green, "#fff")} onClick={addSentence} disabled={!newKo.trim() || !newEn.trim()}>+ 추가하기</button>
            </div>
          )}

          {manageTab === "bulk" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={lbl}>📋 여러 문장 한 번에 입력</span>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", background: C.bg, borderRadius: 8, padding: "10px 12px", lineHeight: 1.8 }}>
                한 줄에 하나씩, <strong>한국어 | English</strong> 형식으로 입력하세요.
              </div>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={"저는 학생이에요. | I am a student.\n오늘 날씨가 좋아요. | The weather is nice today."} rows={8} style={{ ...inp, resize: "vertical", lineHeight: 1.7 }} />
              {bulkError && <div style={{ fontSize: 12, color: C.low, background: C.lowBg, borderRadius: 8, padding: "8px 12px" }}>{bulkError}</div>}
              {bulkSuccess && <div style={{ fontSize: 12, color: C.green, background: C.greenLight, borderRadius: 8, padding: "8px 12px" }}>{bulkSuccess}</div>}
              <button style={mkBtn(C.green, "#fff")} onClick={addBulk} disabled={!bulkText.trim()}>+ 일괄 추가하기</button>
            </div>
          )}

          {manageTab === "csv" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={lbl}>📁 CSV / 엑셀 파일 업로드</span>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", background: C.bg, borderRadius: 8, padding: "10px 12px", lineHeight: 1.8 }}>
                <strong>CSV (.csv)</strong> 파일을 업로드하세요.<br />
                A열: 한국어 | B열: English<br />
                구분자는 , 또는 | 모두 지원해요.
              </div>
              <label style={{ ...mkBtn(C.greenLight, C.green, "1px solid " + C.green + "30"), cursor: "pointer", width: "auto", alignSelf: "flex-start", padding: "12px 24px" }}>
                📂 파일 선택하기
                <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display: "none" }} />
              </label>
              {csvError && <div style={{ fontSize: 12, color: C.low, background: C.lowBg, borderRadius: 8, padding: "8px 12px" }}>{csvError}</div>}
              {csvSuccess && <div style={{ fontSize: 12, color: C.green, background: C.greenLight, borderRadius: 8, padding: "8px 12px" }}>✅ {csvSuccess}</div>}
            </div>
          )}

          {manageTab === "ai" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={lbl}>🤖 AI 문장 자동 생성</span>
              <input style={inp} placeholder="주제 입력 (선택 · 예: 비즈니스, 여행, 일상)" value={genTopic} onChange={e => setGenTopic(e.target.value)} />
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontFamily: "'Nanum Gothic', sans-serif" }}>생성할 문장 수</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[5, 10, 20].map(n => (
                    <button key={n} onClick={() => { setGenCount(n); setGenCountCustom(""); }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid " + (genCount === n && !genCountCustom ? C.green : C.border), background: genCount === n && !genCountCustom ? C.greenLight : C.bg, color: genCount === n && !genCountCustom ? C.green : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                      {n}
                    </button>
                  ))}
                </div>
                <input style={{ ...inp, textAlign: "center" }} type="number" placeholder="직접 입력 (최대 50)" value={genCountCustom} onChange={e => setGenCountCustom(e.target.value)} min={1} max={50} />
              </div>
              <button style={mkBtn(generating ? C.bg : C.orangeLight, generating ? C.muted : C.orange, "1px solid " + C.orange + "40")} onClick={generateAI} disabled={generating}>
                {generating ? "⏳ 생성 중..." : "✨ " + (genCountCustom || genCount) + "개 문장 자동 생성"}
              </button>
            </div>
          )}
        </div>

        {/* Sentence list */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={lbl}>📚 문장 목록 ({sentences.length}개)</span>
          </div>
          <input style={{ ...inp, marginBottom: 10 }} placeholder="🔍 검색..." value={searchText} onChange={e => { setSearchText(e.target.value); setListPage(0); }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "전체" },
              { key: "unlearned", label: "학습 필요" },
              { key: "new", label: "새 문장" },
              { key: "due", label: "복습 예정" },
              { key: "done", label: "학습 완료" },
              { key: "bookmarked", label: "★ 즐겨찾기" },
            ].map(f => (
              <button key={f.key} onClick={() => { setFilterStatus(f.key); setListPage(0); }} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid " + (filterStatus === f.key ? C.green : C.border), background: filterStatus === f.key ? C.greenLight : C.bg, color: filterStatus === f.key ? C.green : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14 }}>검색 결과가 없어요.</div>
          ) : (
            <>
              {groups.map(group => (
                group.items.length === 0 ? null :
                <div key={group.label || "all"} style={{ marginBottom: 14 }}>
                  {group.label && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: group.bg, color: group.color, borderRadius: 8, padding: "2px 10px", fontFamily: "'Nanum Gothic', sans-serif" }}>{group.label}</span>
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>{group.items.length}개</span>
                    </div>
                  )}
                  {group.items.map(s => (
                    <div key={s.id} style={{ borderRadius: 12, border: "1px solid " + C.border, marginBottom: 6, overflow: "hidden", background: C.paper }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", cursor: "pointer" }} onClick={() => toggleExpand(s.id)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, fontWeight: 700, color: C.ink, wordBreak: "keep-all", lineHeight: 1.5 }}>{s.korean}</div>
                          {s.addedDate && <div style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'", marginTop: 2 }}>📅 {s.addedDate} 등록</div>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {s.bookmarked && <span style={{ fontSize: 13, color: "#e8a020" }}>★</span>}
                          {s.lastGrade && <GradeBadge grade={s.lastGrade} />}
                          <span style={{ fontSize: 13, color: C.muted }}>{expandedIds[s.id] ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      {expandedIds[s.id] && (
                        <div style={{ padding: "0 14px 14px", borderTop: "1px solid " + C.border }}>
                          <div style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, color: C.green, marginTop: 10, marginBottom: 8 }}>{s.english}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                            {s.nextReviewDate && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>🔄 복습 {s.nextReviewDate}</span>}
                            {s.reviewCount > 0 && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>🔁 {s.reviewCount}회</span>}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => toggleBookmark(s.id)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid " + C.border, background: s.bookmarked ? "#fef9e7" : C.bg, color: s.bookmarked ? "#e8a020" : C.muted, fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              {s.bookmarked ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기"}
                            </button>
                            <button onClick={() => deleteSentence(s.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff5f5", color: "#991b1b", fontFamily: "'Nanum Gothic', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              삭제
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <button onClick={() => setListPage(p => Math.max(0, p - 1))} disabled={listPage === 0} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid " + C.border, background: C.paper, color: C.ink, cursor: listPage === 0 ? "default" : "pointer", opacity: listPage === 0 ? 0.4 : 1, fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 700 }}>←</button>
                  <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.muted }}>{listPage + 1} / {totalPages}</span>
                  <button onClick={() => setListPage(p => Math.min(totalPages - 1, p + 1))} disabled={listPage === totalPages - 1} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid " + C.border, background: C.paper, color: C.ink, cursor: listPage === totalPages - 1 ? "default" : "pointer", opacity: listPage === totalPages - 1 ? 0.4 : 1, fontFamily: "'Nanum Gothic', sans-serif", fontWeight: 700 }}>→</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Theme selector */}
        <div style={card}>
          <span style={lbl}>🎨 테마 선택</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(THEMES).map(([key, theme]) => (
              <button key={key} onClick={() => setThemeKey(key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1.5px solid " + (themeKey === key ? C.green : C.border), background: themeKey === key ? C.greenLight : C.bg, cursor: "pointer", textAlign: "left" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {[theme.bg, theme.paper, theme.green, theme.orange, theme.ink].map((col, i) => (
                    <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: col, border: "1px solid " + theme.border }} />
                  ))}
                </div>
                <span style={{ fontFamily: "'Nanum Gothic', sans-serif", fontSize: 14, fontWeight: 700, color: themeKey === key ? C.green : C.ink }}>{theme.name}</span>
                {themeKey === key && <span style={{ marginLeft: "auto", fontSize: 12, color: C.green }}>✓ 적용중</span>}
              </button>
            ))}
          </div>
        </div>
      </>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const tabs = [
    { key: "study", label: "학습" },
    { key: "practice", label: "연습" },
    { key: "history", label: "기록" },
    { key: "manage", label: "관리" },
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
              {sentences.length}문장 · 🔥{(() => {
                const sorted = [...studyDates].sort().reverse();
                let s = 0; let check = todayStr();
                for (const d of sorted) { if (d === check) { s++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().slice(0, 10); } else if (d < check) break; }
                return s;
              })()}일 연속
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
          {view === "study" && StudyView()}
          {view === "practice" && PracticeView()}
          {view === "history" && HistoryView()}
          {view === "manage" && ManageView()}
        </div>
      </div>
    </>
  );
}