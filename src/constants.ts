/** Highlight / annotation color palette shared by HighlightPopover & NotePanel */
export const HIGHLIGHT_COLORS = [
  { key: "1", name: "重点", color: "#EF4444" },
  { key: "2", name: "存疑", color: "#F97316" },
  { key: "3", name: "标记", color: "#EAB308" },
  { key: "4", name: "灵感", color: "#22C55E" },
  { key: "5", name: "引用", color: "#3B82F6" },
  { key: "6", name: "感悟", color: "#A855F7" },
  { key: "7", name: "待确认", color: "#6B7280" },
] as const;

/** Theme choices */
export const THEMES = [
  { key: "light" as const, label: "浅" },
  { key: "dark" as const, label: "深" },
  { key: "sepia" as const, label: "护眼" },
];

/** Supported import file extensions */
export const SUPPORTED_EXTENSIONS = ["txt", "epub", "pdf", "md", "markdown", "cbz", "docx"];
