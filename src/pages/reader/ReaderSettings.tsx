import { THEMES } from "../../constants";
import { FONT_FAMILIES, LINE_HEIGHT_PRESETS, CONTENT_WIDTH_PRESETS, PRESETS, type Preset } from "./constants";
import { SettingRow, ChoiceBtn } from "./helpers";

interface ReaderSettingsProps {
  fontSize: number;
  setFontSize: (v: number) => void;
  lineHeight: number;
  setLineHeight: (v: number) => void;
  fontFamilyKey: string;
  setFontFamilyKey: (v: string) => void;
  contentWidthKey: string;
  setContentWidthKey: (v: string) => void;
  paragraphSpacing: number;
  setParagraphSpacing: (v: number) => void;
  textAlign: "left" | "justify";
  setTextAlign: (v: "left" | "justify") => void;
  pageAnimation: string;
  setPageAnimation: (v: string) => void;
  theme: string;
  setTheme: (v: "light" | "dark" | "sepia") => void;
  activePreset: string | null;
  applyPreset: (p: Preset) => void;
  setActivePreset: (v: string | null) => void;
  isSpeaking: boolean;
  isPaused: boolean;
  startTts: () => void;
  pauseTts: () => void;
  resumeTts: () => void;
  stopTts: () => void;
  ttsRate: number;
  setTtsRate: (v: number) => void;
  onClose: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide"
      style={{ color: "var(--text-tertiary)" }}>
      {children}
    </div>
  );
}

export function ReaderSettings({
  fontSize, setFontSize, lineHeight, setLineHeight,
  fontFamilyKey, setFontFamilyKey, contentWidthKey, setContentWidthKey,
  paragraphSpacing, setParagraphSpacing, textAlign, setTextAlign,
  pageAnimation, setPageAnimation, theme, setTheme,
  activePreset, applyPreset, setActivePreset,
  isSpeaking, isPaused, startTts, pauseTts, resumeTts, stopTts,
  ttsRate, setTtsRate, onClose,
}: ReaderSettingsProps) {
  // A manual tweak means the active preset no longer matches — clear its highlight.
  const markCustom = () => {
    if (activePreset) setActivePreset(null);
    localStorage.removeItem("reader-preset");
  };

  return (
    <div className="absolute right-0 top-full mt-2 animate-scale-in"
      style={{
        width: 260, background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xl)", padding: "8px 0",
        maxHeight: "min(70vh, 560px)", overflowY: "auto", zIndex: "var(--z-popover)",
      }}>
      {/* Header + close */}
      <div className="flex items-center justify-between px-3 pb-1.5"
        style={{ borderBottom: "1px solid var(--border-light)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>阅读设置</span>
        <button className="p-1 rounded-md hover-bg"
          style={{ color: "var(--text-tertiary)" }}
          onClick={onClose}
          title="关闭">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ---- Typography ---- */}
      <SectionLabel>排版</SectionLabel>

      {/* Presets */}
      <div className="px-3 py-1.5 flex items-center gap-1.5">
        {PRESETS.map((p) => {
          const isActive = activePreset === p.key;
          return (
            <ChoiceBtn key={p.key} active={isActive}
              style={{ background: isActive ? "var(--accent-soft)" : "transparent" }}
              onClick={() => {
                applyPreset(p);
                setActivePreset(p.key);
                localStorage.setItem("reader-preset", p.key);
              }}
              title={p.label}>
              {p.label}
            </ChoiceBtn>
          );
        })}
      </div>

      {/* Font size slider */}
      <SettingRow label="字号">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs tabular-nums w-6 text-right" style={{ color: "var(--text-tertiary)" }}>{fontSize}</span>
          <input type="range" min={12} max={36} step={1} value={fontSize}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "var(--accent)" }}
            onChange={(e) => { setFontSize(Number(e.target.value)); markCustom(); }} />
        </div>
      </SettingRow>

      {/* Line height */}
      <SettingRow label="行高">
        <div className="flex gap-1">
          {LINE_HEIGHT_PRESETS.map((lh) => (
            <ChoiceBtn key={lh} active={lineHeight === lh} style={{ fontVariantNumeric: "tabular-nums" }}
              onClick={() => { setLineHeight(lh); markCustom(); }}>{lh}</ChoiceBtn>
          ))}
        </div>
      </SettingRow>

      {/* Content width */}
      <SettingRow label="宽度">
        <div className="flex gap-1">
          {CONTENT_WIDTH_PRESETS.map((w) => (
            <ChoiceBtn key={w.key} active={contentWidthKey === w.key}
              onClick={() => { setContentWidthKey(w.key); markCustom(); }}>{w.label}</ChoiceBtn>
          ))}
        </div>
      </SettingRow>

      {/* Paragraph spacing */}
      <SettingRow label="段距">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs tabular-nums w-6 text-right" style={{ color: "var(--text-tertiary)" }}>{paragraphSpacing.toFixed(1)}</span>
          <input type="range" min={0} max={2} step={0.1} value={paragraphSpacing}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "var(--accent)" }}
            onChange={(e) => { setParagraphSpacing(Number(e.target.value)); markCustom(); }} />
        </div>
      </SettingRow>

      {/* Text align */}
      <SettingRow label="对齐">
        <div className="flex gap-1">
          <ChoiceBtn active={textAlign === "left"}
            onClick={() => { setTextAlign("left"); markCustom(); }}>左</ChoiceBtn>
          <ChoiceBtn active={textAlign === "justify"}
            onClick={() => { setTextAlign("justify"); markCustom(); }}>两端</ChoiceBtn>
        </div>
      </SettingRow>

      {/* Font family */}
      <SettingRow label="字体">
        <div className="flex gap-1">
          {FONT_FAMILIES.map((f) => (
            <ChoiceBtn key={f.key} active={fontFamilyKey === f.key} style={{ fontFamily: f.value }}
              onClick={() => { setFontFamilyKey(f.key); markCustom(); }}>{f.label}</ChoiceBtn>
          ))}
        </div>
      </SettingRow>

      {/* Page animation */}
      <SettingRow label="翻页">
        <div className="flex gap-1">
          {[
            { key: "none", label: "无" },
            { key: "fade", label: "淡入" },
            { key: "slide", label: "滑动" },
          ].map((a) => (
            <ChoiceBtn key={a.key} active={pageAnimation === a.key}
              onClick={() => { setPageAnimation(a.key); markCustom(); }}>{a.label}</ChoiceBtn>
          ))}
        </div>
      </SettingRow>

      {/* ---- Theme ---- */}
      <SectionLabel>主题</SectionLabel>
      <SettingRow label="主题">
        <div className="flex gap-1">
          {THEMES.map((t) => (
            <ChoiceBtn key={t.key} active={theme === t.key}
              onClick={() => setTheme(t.key)}>{t.label}</ChoiceBtn>
          ))}
        </div>
      </SettingRow>

      {/* ---- Text-to-speech ---- */}
      {typeof window !== "undefined" && window.speechSynthesis && (
        <>
          <SectionLabel>朗读</SectionLabel>
          <div className="px-3 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>语音朗读</span>
              <div className="flex items-center gap-1">
                {!isSpeaking ? (
                  <button className="p-1 rounded-md hover-bg"
                    style={{ color: "var(--accent)" }}
                    onClick={startTts}
                    title="开始朗读">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                ) : (
                  <>
                    {!isPaused ? (
                      <button className="p-1 rounded-md hover-bg"
                        style={{ color: "var(--accent)" }}
                        onClick={pauseTts}
                        title="暂停">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                        </svg>
                      </button>
                    ) : (
                      <button className="p-1 rounded-md hover-bg"
                        style={{ color: "var(--accent)" }}
                        onClick={resumeTts}
                        title="继续">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                    )}
                    <button className="p-1 rounded-md hover-bg"
                      style={{ color: "var(--text-tertiary)" }}
                      onClick={stopTts}
                      title="停止">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="4" width="16" height="16" rx="1" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>速度</span>
              <input type="range" min="0.5" max="2" step="0.1" value={ttsRate}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
                onChange={(e) => setTtsRate(Number(e.target.value))} />
              <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--text-tertiary)" }}>{ttsRate.toFixed(1)}x</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
