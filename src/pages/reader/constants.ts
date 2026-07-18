export const FONT_FAMILIES = [
  { key: "default", label: "Sans", value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { key: "serif", label: "Serif", value: "Georgia, 'Noto Serif SC', 'Source Han Serif SC', serif" },
  { key: "mono", label: "Mono", value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
] as const;

export const LINE_HEIGHT_PRESETS = [1.4, 1.6, 1.8, 2.0, 2.4] as const;

export const CONTENT_WIDTH_PRESETS = [
  { key: "narrow", label: "窄", value: 480 },
  { key: "medium", label: "中", value: 640 },
  { key: "wide", label: "宽", value: 768 },
  { key: "full", label: "全", value: 960 },
] as const;

export interface Preset {
  key: string;
  label: string;
  font_size: number;
  line_height: number;
  font_family: string;
  content_width: string;
  paragraph_spacing: number;
  text_align: "left" | "justify";
  page_animation: string;
}

export const PRESETS: Preset[] = [
  { key: "comfort", label: "舒适", font_size: 20, line_height: 2.0, font_family: "serif", content_width: "wide", paragraph_spacing: 1.0, text_align: "left", page_animation: "fade" },
  { key: "compact", label: "紧凑", font_size: 14, line_height: 1.4, font_family: "default", content_width: "narrow", paragraph_spacing: 0.4, text_align: "left", page_animation: "none" },
  { key: "sepia-preset", label: "纸张", font_size: 22, line_height: 2.0, font_family: "serif", content_width: "medium", paragraph_spacing: 1.0, text_align: "left", page_animation: "fade" },
  { key: "default-preset", label: "默认", font_size: 18, line_height: 1.8, font_family: "default", content_width: "medium", paragraph_spacing: 0.8, text_align: "left", page_animation: "none" },
];
