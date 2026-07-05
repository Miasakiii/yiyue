export interface Book {
  id: string;
  kind: string;
  title: string;
  author: string | null;
  file_hash: string;
  file_path: string;
  file_size: number;
  format: string;
  cover_path: string | null;
  description: string | null;
  language: string;
  total_chapters: number | null;
  total_chars: number | null;
  metadata_json: string | null;
  reading_mode: string | null;
  added_at: string;
  updated_at: string;
}

export interface BookListItem {
  id: string;
  kind: string;
  title: string;
  author: string | null;
  format: string;
  cover_path: string | null;
  file_size: number;
  total_chapters: number | null;
  added_at: string;
  updated_at: string;
  reading_percentage: number;
  starred: boolean;
}

export interface Chapter {
  id: string;
  book_id: string;
  title: string | null;
  level: number;
  sort_order: number;
  start_offset: number | null;
  end_offset: number | null;
  char_count: number | null;
}

export interface ReadingProgress {
  book_id: string;
  chapter_id: string | null;
  scroll_offset: number;
  page_index: number;
  percentage: number;
  last_read_at: string;
}

export interface BookFilter {
  kind?: string;
  tag?: string;
  group?: string;
  starred?: boolean;
  search?: string;
  sort_by?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  sort_order: number;
}

export interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  sort_order: number;
}

export interface UpdateBook {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
}

export interface UpdateProgress {
  chapter_id?: string;
  scroll_offset?: number;
  page_index?: number;
  percentage?: number;
}

// Comic/Manga types

export interface ComicPage {
  index: number;
  file_name: string;
  width: number;
  height: number;
  image_path: string; // Path to extracted/cached image
}

export interface ReadingProfile {
  book_id: string;
  font_size: number;
  line_height: number;
  font_family: string;
  content_width: string;
  paragraph_spacing: number;
  text_align: string;
  page_animation: string;
}

export interface SaveReadingProfile {
  font_size?: number;
  line_height?: number;
  font_family?: string;
  content_width?: string;
  paragraph_spacing?: number;
  text_align?: string;
  page_animation?: string;
}

/* ---------- Rules ---------- */

export interface Rule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  scope: string;
  is_regex: boolean;
  enabled: boolean;
  priority: number;
  group_id: string | null;
  description: string | null;
}

export interface RuleGroup {
  id: string;
  name: string;
  description: string | null;
  is_preset: boolean;
  enabled: boolean;
}

export interface CreateRule {
  name: string;
  pattern: string;
  replacement: string;
  scope: string;
  is_regex: boolean;
  priority: number;
  group_id?: string | null;
  description?: string | null;
}

export interface UpdateRule {
  name?: string;
  pattern?: string;
  replacement?: string;
  scope?: string;
  is_regex?: boolean;
  enabled?: boolean;
  priority?: number;
  group_id?: string | null;
  description?: string | null;
}
