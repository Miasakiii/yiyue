import { THEMES } from "../../constants";
import { Pause, Play, Square, X } from "lucide-react";
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
  readingMode: "scroll" | "columns";
  setReadingMode: (v: "scroll" | "columns") => void;
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
  readingMode, setReadingMode,
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
        maxHeight: "min(70vh, 560px)", overflowY: "auto", zIndex: "var(--z-modal)",
      }}>
      {/* Header + close */}
      <div className="flex items-center justify-between px-3 pb-1.5"
        style={{ borderBottom: "1px solid var(--border-light)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>阅读设置</span>
        <button className="p-1 rounded hover-bg"
          style={{ color: "var(--text-tertiary)" }}
          onClick={onClose}
          title="关闭">
<X size={ 12 } strokeWidth={2} />
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

      {/* Reading mode (page-turn animation) */}
      <SettingRow label="阅读方式">
        <div className="flex gap-1">
          {[
            { key: "none", label: "滚动" },
            { key: "fade", label: "淡入" },
            { key: "slide", label: "滑动" },
          ].map((a) => (
            <ChoiceBtn key={a.key} active={pageAnimation === a.key}
              onClick={() => { setPageAnimation(a.key); markCustom(); }}>{a.label}</ChoiceBtn>
          ))}
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

      {/* ---- Reading mode ---- */}
      <SectionLabel>阅读模式</SectionLabel>
      <SettingRow label="模式">
        {[
          { key: "scroll" as const, label: "滚动" },
          { key: "columns" as const, label: "分栏" },
        ].map((m) => (
          <ChoiceBtn key={m.key} active={readingMode === m.key} onClick={() => setReadingMode(m.key)}>
            {m.label}
          </ChoiceBtn>
        ))}
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
<Play size={ 14 } strokeWidth={2} />
                  </button>
                ) : (
                  <>
                    {!isPaused ? (
                      <button className="p-1 rounded-md hover-bg"
                        style={{ color: "var(--accent)" }}
                        onClick={pauseTts}
                        title="暂停">
<Pause size={ 14 } strokeWidth={2} />
                      </button>
                    ) : (
                      <button className="p-1 rounded-md hover-bg"
                        style={{ color: "var(--accent)" }}
                        onClick={resumeTts}
                        title="继续">
<Play size={ 14 } strokeWidth={2} />
                      </button>
                    )}
                    <button className="p-1 rounded-md hover-bg"
                      style={{ color: "var(--text-tertiary)" }}
                      onClick={stopTts}
                      title="停止">
<Square size={ 14 } strokeWidth={2} />
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
