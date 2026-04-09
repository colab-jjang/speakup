import { useState, useRef, useCallback, useEffect } from "react";

const FONTS = "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";

const C = {
  bg: "#f0f4f0", paper: "#fafcfa", green: "#2d6a4f", greenLight: "#d8ead8",
  orange: "#d4a017", orangeLight: "#fef9e7", ink: "#1a2e1a", muted: "#5a7a5a",
  border: "#c8dfc8", 상: "#2d6a4f", 상bg: "#d8ead8", 중: "#92400e",
  중bg: "#fef3c7", 하: "#991b1b", 하bg: "#fee2e2",
};

// ── SRS helpers ────────────────────────────────────────────────────────────
const SRS_DAYS = { 상: 7, 중: 3, 하: 1 };
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const isdue = (s) => !s.nextReviewDate || s.nextReviewDate <= todayStr();

function buildQueue(sentences, goal) {
  const never = sentences.filter(s => !s.nextReviewDate);
  const due = sentences.filter(s => s.nextReviewDate && s.nextReviewDate <= todayStr())
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  const combined = [...never, ...due];
  return combined.slice(0, goal);
}

// ── Persist helpers ────────────────────────────────────────────────────────
const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

// ── Initial data ───────────────────────────────────────────────────────────
const INITIAL_SENTENCES = [
  { id: 1, korean: "저는 매일 아침 일찍 일어나요.", english: "I wake up early every morning.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null },
  { id: 2, korean: "오늘 회의가 세 시에 있어요.", english: "I have a meeting at three o'clock today.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null },
  { id: 3, korean: "이 프로젝트는 다음 달까지 완료해야 해요.", english: "This project needs to be completed by next month.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null },
  { id: 4, korean: "날씨가 좋으면 공원에 산책하러 갈게요.", english: "If the weather is nice, I'll go for a walk in the park.", bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null },
];

// ── API ────────────────────────────────────────────────────────────────────
async function callClaude(messages, system) {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  const d = await res.json();
  return d.content[0].text;
}

function getGrade(score) {
  if (score >= 75) return "상";
  if (score >= 45) return "중";
  return "하";
}

// ── Sub-components ─────────────────────────────────────────────────────────
function GradeBadge({ grade, large }) {
  const size = large ? { fontSize: 20, padding: "7px 20px", borderRadius: 28 } : { fontSize: 11, padding: "3px 9px", borderRadius: 16 };
  return <span style={{ ...size, fontWeight: 700, fontFamily: "'Nanum Myeongjo', serif", background: C[`${grade}bg`], color: C[grade], border: `1.5px solid ${C[grade]}30`, display: "inline-block" }}>{grade}</span>;
}

function Waveform({ active }) {
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center", height: 18 }}>
      {[0,1,2,3,4].map(i => (
        <span key={i} style={{ display: "inline-block", width: 3, borderRadius: 2, background: active ? C.orange : C.border, height: active ? undefined : 6, animation: active ? `bar 0.7s ease-in-out infinite alternate ${i*0.1}s` : "none" }} />
      ))}
      <style>{`@keyframes bar{0%{height:3px}100%{height:18px}}`}</style>
    </span>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("practice");
  const [sentences, setSentences] = useState(() => load("su_sentences", INITIAL_SENTENCES));
  const [dailyGoal, setDailyGoal] = useState(() => load("su_goal", 5));
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
  const [translating, setTranslating] = useState(null); // "ko" | "en" | null
  const [genTopic, setGenTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  const recRef = useRef(null);
  const transcriptRef = useRef("");
  const evaluatedRef = useRef(false);
  const doEvalRef = useRef(null);
  const currentRef = useRef(null);

  // ── Persist on change ──
  useEffect(() => { save("su_sentences", sentences); }, [sentences]);
  useEffect(() => { save("su_goal", dailyGoal); }, [dailyGoal]);
  useEffect(() => { save("su_dates", studyDates); }, [studyDates]);
  useEffect(() => { save("su_history", history.slice(0, 200)); }, [history]);
  useEffect(() => { save("su_done_today", { date: todayStr(), ids: doneToday }); }, [doneToday]);

  // ── Queue ──────────────────────────────────────────────────────────────
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
  const allDone = todayDone >= dailyGoal;

  // ── Speech ─────────────────────────────────────────────────────────────
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

  // ── Evaluate ───────────────────────────────────────────────────────────
  const doEval = async (answer) => {
    const cur = currentRef.current;
    if (!cur) return;
    try {
      const raw = await callClaude(
        [{ role: "user", content: `Korean: "${cur.korean}"\nCorrect English: "${cur.english}"\nUser answered: "${answer}"` }],
        `You are a friendly English tutor. Evaluate Korean-to-English translation.
Respond ONLY with valid JSON (no markdown):
{"score":<0-100>,"feedbackKo":"<1-2 sentences in Korean>","correctionKo":"<correction in Korean or empty string>","bestVersion":"<ideal English>"}`
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const grade = getGrade(parsed.score);
      setEvalResult({ ...parsed, grade });
      setPhase("result");

      // SRS update
      const nextDate = addDays(SRS_DAYS[grade]);
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
      const msg = err?.message || String(err);
      setEvalResult({ score: 0, grade: "하", feedbackKo: `오류: ${msg}`, correctionKo: "", bestVersion: cur.english });
      setPhase("result");
    }
  };
  doEvalRef.current = doEval;

  // ── Helpers ────────────────────────────────────────────────────────────
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

  // ── Auto-translate ─────────────────────────────────────────────────────
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
          ? `Translate the following English sentence to natural Korean. Respond with ONLY the Korean translation, nothing else.`
          : `Translate the following Korean sentence to natural English. Respond with ONLY the English translation, nothing else.`
      );
      if (dir === "ko") setNewKo(raw.trim());
      else setNewEn(raw.trim());
    } catch (err) {
      setTranslateError(`번역 오류: ${err?.message || String(err)}`);
    }
    setTranslating(null);
  };

  const addSentence = () => {
    if (!newKo.trim() || !newEn.trim()) return;
    setSentences(p => [...p, { id: Date.now(), korean: newKo.trim(), english: newEn.trim(), bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null }]);
    setNewKo(""); setNewEn("");
  };

  const generateAI = async () => {
    setGenerating(true);
    try {
      const raw = await callClaude(
        [{ role: "user", content: genTopic || "다양한 일상 주제" }],
        `Generate 5 Korean-English sentence pairs for translation practice.
Respond ONLY with valid JSON array (no markdown): [{"korean":"...","english":"..."},...]`
      );
      const arr = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSentences(p => [...p, ...arr.map((s, i) => ({ id: Date.now() + i, ...s, bookmarked: false, reviewCount: 0, nextReviewDate: null, lastGrade: null }))]);
      setGenTopic("");
    } catch { alert("생성 중 오류가 발생했어요."); }
    setGenerating(false);
  };

  // ── Shared styles ──────────────────────────────────────────────────────
  const card = { background: C.paper, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" };
  const mkBtn = (bg, color, border) => ({ width: "100%", padding: "14px", borderRadius: 12, border: border || "none", background: bg, color, fontFamily: "'Nanum Myeongjo', serif", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 });
  const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, boxSizing: "border-box", border: `1.5px solid ${C.border}`, background: C.bg, fontFamily: "'Nanum Myeongjo', serif", fontSize: 14, color: C.ink, outline: "none" };
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

  // ── Practice View ──────────────────────────────────────────────────────
  const PracticeView = () => {
    // All done today
    if (allDone) return (
      <div style={{ textAlign: "center", padding: "50px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 8 }}>오늘 목표 완료!</div>
        <div style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          {dailyGoal}개 문장을 모두 풀었어요.<br />내일 또 만나요 😊
        </div>
        <div style={{ ...card, textAlign: "left" }}>
          <span style={lbl}>오늘 결과</span>
          {["상","중","하"].map(g => {
            const cnt = history.filter(h => h.date.slice(0,10) === todayStr() && h.grade === g).length;
            return cnt > 0 ? (
              <div key={g} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <GradeBadge grade={g} />
                <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.muted }}>{cnt}개</span>
              </div>
            ) : null;
          })}
        </div>
        <button style={mkBtn(C.green, "#fff")} onClick={refreshQueue}>내일 문장 미리 보기</button>
      </div>
    );

    if (!current) return (
      <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
        <div style={{ fontFamily: "'Nanum Myeongjo', serif", marginBottom: 16 }}>오늘 풀 문장이 없어요!</div>
        <button style={{ ...mkBtn(C.green, "#fff"), width: "auto", padding: "12px 24px" }} onClick={refreshQueue}>큐 새로고침</button>
      </div>
    );

    return (
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Progress */}
        <div style={{ ...card, padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 13, fontWeight: 600, color: C.ink }}>오늘 진행</span>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.muted }}>{todayDone} / {dailyGoal}개</span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (todayDone / dailyGoal) * 100)}%`, background: C.green, borderRadius: 3, transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, color: C.muted }}>{qIdx + 1} / {queue.length} 번째 문장</span>
            {current.nextReviewDate === null && <span style={{ fontSize: 10, background: C.orangeLight, color: C.orange, borderRadius: 8, padding: "2px 8px", fontFamily: "'Nanum Myeongjo', serif", fontWeight: 600 }}>새 문장</span>}
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
          <p style={{ fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1.55, margin: "0 0 18px", fontFamily: "'Nanum Myeongjo', serif" }}>{current.korean}</p>
          <button style={mkBtn(C.greenLight, C.green, `1px solid ${C.green}30`)} onClick={speakKorean} disabled={phase === "speaking"}>
            {phase === "speaking" ? <><Waveform active /><span>읽는 중...</span></> : <><span>🔊</span><span>한국어 듣기</span></>}
          </button>
        </div>

        {/* Input */}
        {phase !== "result" && phase !== "evaluating" && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={lbl}>영어로 번역해서 답하세요</span>
              <button onClick={() => setUseTyping(t => !t)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, color: C.muted, cursor: "pointer", fontFamily: "'Nanum Myeongjo', serif" }}>
                {useTyping ? "🎤 음성으로" : "⌨️ 타이핑으로"}
              </button>
            </div>
            {!useTyping ? (
              <>
                {(phase === "ready" || phase === "listening_ready") && <button style={mkBtn(C.orangeLight, C.orange, `1px solid ${C.orange}40`)} onClick={startListening}><span>🎤</span><span>말하기 시작</span></button>}
                {phase === "processing" && <div style={{ textAlign: "center", color: C.muted, fontSize: 14, padding: "12px 0", fontFamily: "'Nanum Myeongjo', serif" }}>🎙️ 음성 처리 중...</div>}
                {phase === "listening" && <button style={mkBtn("#fee2e2", "#991b1b", "1px solid #fca5a5")} onClick={() => { try { recRef.current?.stop(); } catch(e){} setPhase("processing"); }}><Waveform active /><span>듣는 중... (탭하면 중지)</span></button>}
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
            <div style={{ color: C.muted, fontSize: 14, fontFamily: "'Nanum Myeongjo', serif" }}>AI가 평가 중이에요...</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.green, marginTop: 10 }}>"{spokenText}"</div>
          </div>
        )}

        {/* Result */}
        {phase === "result" && evalResult && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.border}` }}>
              <GradeBadge grade={evalResult.grade} large />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.ink, fontFamily: "'Nanum Myeongjo', serif", marginBottom: 4 }}>
                  {evalResult.grade === "상" ? "훌륭해요! 🎉" : evalResult.grade === "중" ? "잘 했어요! 👏" : "다시 도전해봐요 💪"}
                </div>
                <div style={{ fontSize: 13, color: C.muted, fontFamily: "'Nanum Myeongjo', serif", lineHeight: 1.6 }}>{evalResult.feedbackKo}</div>
              </div>
            </div>

            {evalResult.grade !== "하" && (
              <div style={{ background: C.greenLight, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.green, fontFamily: "'Nanum Myeongjo', serif" }}>
                📅 다음 복습: {evalResult.grade === "상" ? "7일 후" : "3일 후"}
              </div>
            )}

            {evalResult.grade === "하" && (
              <div style={{ background: "#fff5f5", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14, fontFamily: "'Nanum Myeongjo', serif", marginBottom: 4 }}>🔄 재도전이 필요해요!</div>
                <div style={{ fontSize: 13, color: "#7f1d1d", fontFamily: "'Nanum Myeongjo', serif", lineHeight: 1.6 }}>내일 다시 출제돼요.</div>
              </div>
            )}

            <span style={lbl}>내가 말한 것</span>
            <div style={{ background: "#f0f4ff", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #6366f1", marginBottom: 12 }}>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: "#3730a3" }}>"{spokenText}"</span>
            </div>

            <span style={lbl}>베스트 번역</span>
            <div style={{ background: C.greenLight, borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${C.green}`, marginBottom: evalResult.correctionKo ? 12 : 16 }}>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.green }}>{evalResult.bestVersion}</span>
            </div>

            {evalResult.correctionKo && (
              <>
                <span style={lbl}>교정 포인트</span>
                <div style={{ background: C.중bg, borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${C.중}`, marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: C.중, fontFamily: "'Nanum Myeongjo', serif", lineHeight: 1.6 }}>{evalResult.correctionKo}</span>
                </div>
              </>
            )}

            {evalResult.grade === "하" ? (
              <>
                <button style={mkBtn("#fee2e2", "#991b1b", "1.5px solid #fca5a5")} onClick={retry}>🔄 다시 도전하기</button>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>←</button>
                  <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>→</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1 }} onClick={reset}>🔄 다시 시도</button>
                  <button style={{ ...mkBtn(C.green, "#fff"), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>다음 문장 →</button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>←</button>
                  <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>→</button>
                </div>
              </>
            )}
          </div>
        )}

        {phase !== "result" && (
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1, opacity: isFirst ? 0.3 : 1 }} onClick={goPrev} disabled={isFirst}>←</button>
            <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1, opacity: isLast ? 0.3 : 1 }} onClick={goNext} disabled={isLast}>→</button>
          </div>
        )}
      </div>
    );
  };

  // ── History + Calendar View ────────────────────────────────────────────
  const HistoryView = () => {
    const gc = { 상: 0, 중: 0, 하: 0 };
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
    const monthNames = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
    const dayNames = ["일","월","화","수","목","금","토"];

    return (
      <>
        {/* Streak + summary */}
        <div style={{ ...card, display: "flex", padding: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Nanum Myeongjo', serif", color: C.orange }}>{streak}</div>
            <div style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 12, color: C.muted, marginTop: 2 }}>🔥 연속 학습일</div>
          </div>
          {["상","중","하"].map((g, i) => (
            <div key={g} style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: i < 2 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Nanum Myeongjo', serif", color: C[g], marginBottom: 4 }}>{gc[g]}</div>
              <GradeBadge grade={g} />
            </div>
          ))}
        </div>

        {/* Calendar */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>‹</button>
            <span style={{ fontFamily: "'Nanum Myeongjo', serif", fontWeight: 700, fontSize: 16, color: C.ink }}>{y}년 {monthNames[m]}</span>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
            {dayNames.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono'", padding: "4px 0" }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day = i + 1;
              const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const studied = studyDates.includes(dateStr);
              const isToday = dateStr === todayStr();
              return (
                <div key={day} style={{ textAlign: "center", padding: "6px 0", borderRadius: 8, background: studied ? C.green : isToday ? C.greenLight : "transparent", color: studied ? "#fff" : isToday ? C.green : C.ink, fontSize: 13, fontWeight: isToday ? 700 : 400, fontFamily: "'IBM Plex Mono'" }}>
                  {day}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14, fontSize: 11, fontFamily: "'Nanum Myeongjo', serif", color: C.muted }}>
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.green, borderRadius: 3, verticalAlign: "middle", marginRight: 4 }} />학습 완료</span>
            <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 3, verticalAlign: "middle", marginRight: 4 }} />오늘</span>
          </div>
        </div>

        {/* History list */}
        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
            <div style={{ fontFamily: "'Nanum Myeongjo', serif" }}>아직 기록이 없어요. 연습을 시작해보세요!</div>
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
            <div style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{h.korean}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: "#6366f1", marginBottom: 3 }}>내 답: {h.spoken}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.green }}>정답: {h.bestVersion}</div>
          </div>
        ))}
      </>
    );
  };

  // ── Manage View ────────────────────────────────────────────────────────
  const ManageView = () => (
    <>
      {/* Daily goal */}
      <div style={card}>
        <span style={lbl}>🎯 하루 목표 문장 수</span>
        <div style={{ display: "flex", gap: 10 }}>
          {[5, 10, 15].map(n => (
            <button key={n} onClick={() => setDailyGoal(n)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1.5px solid ${dailyGoal === n ? C.green : C.border}`, background: dailyGoal === n ? C.greenLight : C.bg, color: dailyGoal === n ? C.green : C.muted, fontFamily: "'Nanum Myeongjo', serif", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontFamily: "'Nanum Myeongjo', serif", lineHeight: 1.6 }}>
          현재 큐: 복습 필요 {sentences.filter(s => s.nextReviewDate && s.nextReviewDate <= todayStr()).length}개 · 새 문장 {sentences.filter(s => !s.nextReviewDate).length}개
        </div>
      </div>

      {/* Add sentence */}
      <div style={card}>
        <span style={lbl}>✏️ 직접 추가</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={inp} placeholder="한국어 문장" value={newKo} onChange={e => setNewKo(e.target.value)} />
          {newKo.trim() && (
            <button onClick={() => autoTranslate("en")} disabled={!!translating} style={mkBtn(C.orangeLight, C.orange, `1px solid ${C.orange}40`)}>
              {translating === "en" ? "⏳ 번역 중..." : "✨ 영어로 자동번역"}
            </button>
          )}
          <input style={inp} placeholder="English translation" value={newEn} onChange={e => setNewEn(e.target.value)} />
          {newEn.trim() && (
            <button onClick={() => autoTranslate("ko")} disabled={!!translating} style={mkBtn(C.greenLight, C.green, `1px solid ${C.green}30`)}>
              {translating === "ko" ? "⏳ 번역 중..." : "✨ 한국어로 자동번역"}
            </button>
          )}
          {translateError && <div style={{ fontSize: 12, color: C.하, fontFamily: "'Nanum Myeongjo', serif", padding: "8px", background: C.하bg, borderRadius: 8 }}>{translateError}</div>}
          <button style={mkBtn(C.green, "#fff")} onClick={addSentence} disabled={!newKo.trim() || !newEn.trim()}>+ 추가하기</button>
        </div>
      </div>

      {/* AI generate */}
      <div style={card}>
        <span style={lbl}>🤖 AI 자동 생성</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={inp} placeholder="주제 입력 (선택 · 예: 비즈니스, 여행)" value={genTopic} onChange={e => setGenTopic(e.target.value)} />
          <button style={mkBtn(generating ? C.bg : C.orangeLight, generating ? C.muted : C.orange, `1px solid ${C.orange}40`)} onClick={generateAI} disabled={generating}>
            {generating ? "⏳ 생성 중..." : "✨ 5개 문장 자동 생성"}
          </button>
        </div>
      </div>

      {/* Sentence list */}
      <div style={card}>
        <span style={lbl}>📚 문장 목록 ({sentences.length}개)</span>
        {sentences.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                {s.bookmarked && <span style={{ fontSize: 12, color: "#e8a020" }}>★</span>}
                {!s.nextReviewDate && <span style={{ fontSize: 10, background: C.orangeLight, color: C.orange, borderRadius: 6, padding: "1px 6px", fontFamily: "'Nanum Myeongjo', serif", fontWeight: 600 }}>새 문장</span>}
                {s.nextReviewDate && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>복습 {s.nextReviewDate}</span>}
                {s.reviewCount > 0 && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>🔁{s.reviewCount}</span>}
              </div>
              <div style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 14, color: C.ink, marginBottom: 2 }}>{s.korean}</div>
              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.muted }}>{s.english}</div>
            </div>
            <button onClick={() => toggleBookmark(s.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: s.bookmarked ? "#e8a020" : C.border, flexShrink: 0 }}>{s.bookmarked ? "★" : "☆"}</button>
            <button onClick={() => deleteSentence(s.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#fca5a5", flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────
  const tabs = [
    { key: "practice", label: "연습" },
    { key: "history", label: "기록" },
    { key: "manage", label: "관리" },
  ];

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href={FONTS} rel="stylesheet" />
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ background: C.paper, borderBottom: `1px solid ${C.border}`, padding: "20px 24px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Nanum Myeongjo', serif", fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: "-0.5px" }}>
              Speak<span style={{ color: C.orange }}>Up</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: C.muted, textAlign: "right" }}>
              {sentences.length}문장 · 🔥{(() => {
                const sorted = [...studyDates].sort().reverse();
                let s = 0; let check = todayStr();
                for (const d of sorted) { if (d === check) { s++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().slice(0,10); } else if (d < check) break; }
                return s;
              })()}일 연속
            </div>
          </div>
          <div style={{ display: "flex", borderBottom: `2px solid ${C.border}` }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setView(t.key)} style={{ flex: 1, padding: "14px 0", border: "none", cursor: "pointer", fontFamily: "'Nanum Myeongjo', serif", fontWeight: 600, fontSize: 14, background: "none", color: view === t.key ? C.green : C.muted, borderBottom: view === t.key ? `3px solid ${C.green}` : "3px solid transparent", marginBottom: -2, transition: "all 0.2s" }}>
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