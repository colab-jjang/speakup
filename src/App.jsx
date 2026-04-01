import { useState, useRef, useCallback } from "react";

const FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,600;0,700;1,300&family=Noto+Sans+KR:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap";

const C = {
  bg: "#f5f0e8", paper: "#fffdf9", green: "#1b4332", greenLight: "#e9f5ee",
  orange: "#c84b0f", orangeLight: "#fdf0ea", ink: "#1a1a1a", muted: "#7a7060",
  border: "#e2ddd4", 상: "#1b4332", 상bg: "#e9f5ee", 중: "#92400e",
  중bg: "#fef3c7", 하: "#991b1b", 하bg: "#fee2e2",
};

const INITIAL = [
  { id: 1, korean: "저는 매일 아침 일찍 일어나요.", english: "I wake up early every morning.", bookmarked: false, reviewCount: 0 },
  { id: 2, korean: "오늘 회의가 세 시에 있어요.", english: "I have a meeting at three o'clock today.", bookmarked: false, reviewCount: 0 },
  { id: 3, korean: "이 프로젝트는 다음 달까지 완료해야 해요.", english: "This project needs to be completed by next month.", bookmarked: false, reviewCount: 0 },
  { id: 4, korean: "날씨가 좋으면 공원에 산책하러 갈게요.", english: "If the weather is nice, I'll go for a walk in the park.", bookmarked: false, reviewCount: 0 },
];

async function callClaude(messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
  });
  const d = await res.json();
  return d.content[0].text;
}

function getGrade(score) {
  if (score >= 75) return "상";
  if (score >= 45) return "중";
  return "하";
}

function GradeBadge({ grade, large }) {
  const size = large
    ? { fontSize: 20, padding: "7px 20px", borderRadius: 28 }
    : { fontSize: 11, padding: "3px 9px", borderRadius: 16 };
  return (
    <span style={{ ...size, fontWeight: 700, fontFamily: "'Fraunces', serif", background: C[`${grade}bg`], color: C[grade], border: `1.5px solid ${C[grade]}30`, display: "inline-block" }}>
      {grade}
    </span>
  );
}

function Waveform({ active }) {
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center", height: 18 }}>
      {[0,1,2,3,4].map(i => (
        <span key={i} style={{
          display: "inline-block", width: 3, borderRadius: 2,
          background: active ? C.orange : C.border,
          height: active ? undefined : 6,
          animation: active ? `bar 0.7s ease-in-out infinite alternate ${i*0.1}s` : "none",
        }} />
      ))}
      <style>{`@keyframes bar{0%{height:3px}100%{height:18px}}`}</style>
    </span>
  );
}

export default function App() {
  const [view, setView] = useState("practice");
  const [sentences, setSentences] = useState(INITIAL);
  const [idx, setIdx] = useState(0);
  const [filterBookmarks, setFilterBookmarks] = useState(false);
  const [phase, setPhase] = useState("ready");
  const [spokenText, setSpokenText] = useState("");
  const [typedText, setTypedText] = useState("");
  const [useTyping, setUseTyping] = useState(false);
  const [evalResult, setEvalResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [newKo, setNewKo] = useState("");
  const [newEn, setNewEn] = useState("");
  const [genTopic, setGenTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const recRef = useRef(null);

  const displayList = filterBookmarks ? sentences.filter(s => s.bookmarked) : sentences;
  const current = displayList[idx] || null;

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
    rec.onstart = () => setPhase("listening");
    rec.onresult = async (e) => {
      const t = e.results[0][0].transcript;
      setSpokenText(t); setPhase("evaluating");
      await doEval(t);
    };
    rec.onerror = (e) => { if (e.error !== "aborted") setPhase("listening_ready"); else setPhase("listening_ready"); };
    recRef.current = rec; rec.start();
  }, [current, retryCount]);

  const submitTyped = async () => {
    if (!typedText.trim()) return;
    const ans = typedText.trim();
    setSpokenText(ans); setPhase("evaluating");
    await doEval(ans);
  };

  const doEval = async (answer) => {
    if (!current) return;
    try {
      const raw = await callClaude(
        [{ role: "user", content: `Korean: "${current.korean}"\nCorrect English: "${current.english}"\nUser answered: "${answer}"` }],
        `You are a friendly English tutor. Evaluate the user's Korean-to-English translation.
Respond ONLY with valid JSON (no markdown):
{"score":<0-100>,"feedbackKo":"<1-2 sentences in Korean>","correctionKo":"<correction in Korean or empty string>","bestVersion":"<ideal English>"}`
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const grade = getGrade(parsed.score);
      setEvalResult({ ...parsed, grade });
      setPhase("result");
      const entry = { id: Date.now(), sentenceId: current.id, korean: current.korean, english: current.english, spoken: answer, grade, bestVersion: parsed.bestVersion, feedbackKo: parsed.feedbackKo, correctionKo: parsed.correctionKo, date: new Date(), attempt: retryCount + 1 };
      setHistory(h => [entry, ...h]);
      setSentences(s => s.map(x => x.id === current.id ? { ...x, reviewCount: x.reviewCount + 1 } : x));
    } catch {
      setEvalResult({ score: 0, grade: "하", feedbackKo: "평가 중 오류가 발생했어요.", correctionKo: "", bestVersion: current.english });
      setPhase("result");
    }
  };

  const reset = () => { window.speechSynthesis.cancel(); setPhase("ready"); setSpokenText(""); setTypedText(""); setEvalResult(null); setRetryCount(0); };
  const retry = () => { setRetryCount(r => r + 1); setPhase("ready"); setSpokenText(""); setTypedText(""); setEvalResult(null); };
  const goTo = (delta) => { if (!displayList.length) return; setIdx(i => (i + delta + displayList.length) % displayList.length); reset(); };
  const toggleBookmark = (id) => setSentences(s => s.map(x => x.id === id ? { ...x, bookmarked: !x.bookmarked } : x));
  const addSentence = () => { if (!newKo.trim() || !newEn.trim()) return; setSentences(p => [...p, { id: Date.now(), korean: newKo.trim(), english: newEn.trim(), bookmarked: false, reviewCount: 0 }]); setNewKo(""); setNewEn(""); };
  const deleteSentence = (id) => { setSentences(p => p.filter(s => s.id !== id)); setIdx(0); reset(); };
  const generateAI = async () => {
    setGenerating(true);
    try {
      const raw = await callClaude([{ role: "user", content: genTopic || "다양한 일상 주제" }], `Generate 5 Korean-English sentence pairs. Respond ONLY with valid JSON array (no markdown):[{"korean":"...","english":"..."},...]`);
      const arr = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSentences(p => [...p, ...arr.map((s, i) => ({ id: Date.now() + i, ...s, bookmarked: false, reviewCount: 0 }))]);
      setGenTopic("");
    } catch { alert("생성 중 오류가 발생했어요."); }
    setGenerating(false);
  };

  const card = { background: C.paper, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" };
  const mkBtn = (bg, color, border) => ({ width: "100%", padding: "14px", borderRadius: 12, border: border || "none", background: bg, color, fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 });
  const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, boxSizing: "border-box", border: `1.5px solid ${C.border}`, background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, color: C.ink, outline: "none" };
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.muted, textTransform: "uppercase", marginBottom: 8, display: "block" };

  // ── Practice ──
  const PracticeView = () => {
    if (!displayList.length) return (
      <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
        <div style={{ fontFamily: "'Noto Sans KR'" }}>{filterBookmarks ? "즐겨찾기한 문장이 없어요." : "문장을 추가해주세요."}</div>
      </div>
    );

    return (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={() => { setFilterBookmarks(f => !f); setIdx(0); reset(); }} style={{ background: filterBookmarks ? C.green : C.paper, border: `1px solid ${filterBookmarks ? C.green : C.border}`, borderRadius: 20, padding: "7px 16px", fontSize: 12, color: filterBookmarks ? "#fff" : C.muted, cursor: "pointer", fontFamily: "'Noto Sans KR'", fontWeight: 600 }}>
            {filterBookmarks ? "★ 즐겨찾기만" : "☆ 즐겨찾기만 보기"}
          </button>
        </div>

        {/* Sentence card */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: C.muted }}>{idx + 1} / {displayList.length}</span>
              {retryCount > 0 && <span style={{ fontSize: 11, color: C.orange, fontFamily: "'IBM Plex Mono'" }}>재도전 #{retryCount}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {current.reviewCount > 0 && <span style={{ fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>🔁 {current.reviewCount}회</span>}
              <button onClick={() => toggleBookmark(current.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: current.bookmarked ? "#e8a020" : C.border, padding: 0 }}>
                {current.bookmarked ? "★" : "☆"}
              </button>
            </div>
          </div>
          <p style={{ fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1.55, margin: "0 0 18px", fontFamily: "'Noto Sans KR', sans-serif" }}>{current.korean}</p>
          <button style={mkBtn(C.greenLight, C.green, `1px solid ${C.green}30`)} onClick={speakKorean} disabled={phase === "speaking"}>
            {phase === "speaking" ? <><Waveform active /><span>읽는 중...</span></> : <><span>🔊</span><span>한국어 듣기</span></>}
          </button>
        </div>

        {/* Input */}
        {phase !== "result" && phase !== "evaluating" && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={lbl}>영어로 번역해서 답하세요</span>
              <button onClick={() => setUseTyping(t => !t)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, color: C.muted, cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>
                {useTyping ? "🎤 음성으로" : "⌨️ 타이핑으로"}
              </button>
            </div>
            {!useTyping ? (
              <>
                {phase === "ready" && <div style={{ textAlign: "center", color: C.muted, fontSize: 14, padding: "12px 0", fontFamily: "'Noto Sans KR'" }}>먼저 한국어 문장을 들어보세요 👆</div>}
                {phase === "listening_ready" && <button style={mkBtn(C.orangeLight, C.orange, `1px solid ${C.orange}40`)} onClick={startListening}><span>🎤</span><span>말하기 시작</span></button>}
                {phase === "processing" && <div style={{ textAlign: "center", color: C.muted, fontSize: 14, padding: "12px 0", fontFamily: "'Noto Sans KR'" }}>🎙️ 음성 처리 중...</div>}
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
            <div style={{ color: C.muted, fontSize: 14, fontFamily: "'Noto Sans KR'" }}>AI가 평가 중이에요...</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: C.green, marginTop: 10 }}>"{spokenText}"</div>
          </div>
        )}

        {/* Result */}
        {phase === "result" && evalResult && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.border}` }}>
              <GradeBadge grade={evalResult.grade} large />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.ink, fontFamily: "'Fraunces', serif", marginBottom: 4 }}>
                  {evalResult.grade === "상" ? "훌륭해요! 🎉" : evalResult.grade === "중" ? "잘 했어요! 👏" : "다시 도전해봐요 💪"}
                </div>
                <div style={{ fontSize: 13, color: C.muted, fontFamily: "'Noto Sans KR'", lineHeight: 1.6 }}>{evalResult.feedbackKo}</div>
              </div>
            </div>

            {evalResult.grade === "하" && (
              <div style={{ background: "#fff5f5", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14, fontFamily: "'Fraunces', serif", marginBottom: 4 }}>🔄 재도전이 필요해요!</div>
                <div style={{ fontSize: 13, color: "#7f1d1d", fontFamily: "'Noto Sans KR'", lineHeight: 1.6 }}>아래 힌트를 참고해서 다시 한번 도전해보세요.</div>
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
                  <span style={{ fontSize: 13, color: C.중, fontFamily: "'Noto Sans KR'", lineHeight: 1.6 }}>{evalResult.correctionKo}</span>
                </div>
              </>
            )}

            {evalResult.grade === "하" ? (
              <button style={mkBtn("#fee2e2", "#991b1b", "1.5px solid #fca5a5")} onClick={retry}>🔄 다시 도전하기</button>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1 }} onClick={reset}>🔄 다시 시도</button>
                <button style={{ ...mkBtn(C.green, "#fff"), flex: 1 }} onClick={() => goTo(1)}>다음 문장 →</button>
              </div>
            )}
          </div>
        )}

        {phase !== "result" && (
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1 }} onClick={() => goTo(-1)}>←</button>
            <button style={{ ...mkBtn(C.bg, C.muted, `1px solid ${C.border}`), flex: 1 }} onClick={() => goTo(1)}>→</button>
          </div>
        )}
      </>
    );
  };

  // ── History ──
  const HistoryView = () => {
    const gc = { 상: 0, 중: 0, 하: 0 };
    history.forEach(h => gc[h.grade]++);
    return (
      <>
        {history.length > 0 && (
          <div style={{ ...card, display: "flex", padding: 0, overflow: "hidden", marginBottom: 14 }}>
            {["상", "중", "하"].map((g, i) => (
              <div key={g} style={{ flex: 1, textAlign: "center", padding: "18px 0", borderRight: i < 2 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Fraunces', serif", color: C[g], marginBottom: 6 }}>{gc[g]}</div>
                <GradeBadge grade={g} />
              </div>
            ))}
          </div>
        )}
        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
            <div style={{ fontFamily: "'Noto Sans KR'" }}>아직 기록이 없어요. 연습을 시작해보세요!</div>
          </div>
        ) : history.map(h => (
          <div key={h.id} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <GradeBadge grade={h.grade} />
                {h.attempt > 1 && <span style={{ fontSize: 11, color: C.orange, fontFamily: "'IBM Plex Mono'" }}>재도전 #{h.attempt}</span>}
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: C.muted }}>
                {h.date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} {h.date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ fontFamily: "'Noto Sans KR'", fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 5 }}>{h.korean}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: "#6366f1", marginBottom: 4 }}>내 답: {h.spoken}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.green }}>정답: {h.bestVersion}</div>
          </div>
        ))}
      </>
    );
  };

  // ── Manage ──
  const ManageView = () => (
    <>
      <div style={card}>
        <span style={lbl}>✏️ 직접 추가</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={inp} placeholder="한국어 문장" value={newKo} onChange={e => setNewKo(e.target.value)} />
          <input style={inp} placeholder="English translation" value={newEn} onChange={e => setNewEn(e.target.value)} onKeyDown={e => e.key === "Enter" && addSentence()} />
          <button style={mkBtn(C.green, "#fff")} onClick={addSentence}>+ 추가하기</button>
        </div>
      </div>
      <div style={card}>
        <span style={lbl}>🤖 AI 자동 생성</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={inp} placeholder="주제 입력 (선택 · 예: 비즈니스, 여행)" value={genTopic} onChange={e => setGenTopic(e.target.value)} />
          <button style={mkBtn(generating ? C.bg : C.orangeLight, generating ? C.muted : C.orange, `1px solid ${C.orange}40`)} onClick={generateAI} disabled={generating}>
            {generating ? "⏳ 생성 중..." : "✨ 5개 문장 자동 생성"}
          </button>
        </div>
      </div>
      <div style={card}>
        <span style={lbl}>📚 문장 목록 ({sentences.length}개)</span>
        {sentences.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                {s.bookmarked && <span style={{ fontSize: 12, color: "#e8a020" }}>★</span>}
                {s.reviewCount > 0 && <span style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>🔁 {s.reviewCount}회</span>}
              </div>
              <div style={{ fontFamily: "'Noto Sans KR'", fontSize: 14, color: C.ink, marginBottom: 3 }}>{s.korean}</div>
              <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: C.muted }}>{s.english}</div>
            </div>
            <button onClick={() => toggleBookmark(s.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: s.bookmarked ? "#e8a020" : C.border, flexShrink: 0 }}>{s.bookmarked ? "★" : "☆"}</button>
            <button onClick={() => deleteSentence(s.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#fca5a5", flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </>
  );

  const tabs = [{ key: "practice", label: "연습" }, { key: "history", label: "기록" }, { key: "manage", label: "관리" }];

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href={FONTS} rel="stylesheet" />
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ background: C.paper, borderBottom: `1px solid ${C.border}`, padding: "20px 24px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: "-0.5px" }}>
              Speak<span style={{ color: C.orange }}>Up</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: C.muted }}>
              {sentences.length}문장 · 기록 {history.length}개
            </div>
          </div>
          <div style={{ display: "flex", borderBottom: `2px solid ${C.border}` }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setView(t.key)} style={{
                flex: 1, padding: "14px 0", border: "none", cursor: "pointer",
                fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 600, fontSize: 14,
                background: "none", color: view === t.key ? C.green : C.muted,
                borderBottom: view === t.key ? `3px solid ${C.green}` : "3px solid transparent",
                marginBottom: -2, transition: "all 0.2s",
              }}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
          {view === "practice" && <PracticeView />}
          {view === "history" && <HistoryView />}
          {view === "manage" && <ManageView />}
        </div>
      </div>
    </>
  );
}
