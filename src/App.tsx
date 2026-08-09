import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAppStore } from "./stores/app";
import { Library } from "./pages/Library";
import { Reader } from "./pages/Reader";
import { ComicReader } from "./pages/ComicReader";
import { Stats } from "./pages/Stats";
import { SyncSettings } from "./pages/SyncSettings";
import { Rules } from "./pages/Rules";
import { OpdsSettings } from "./pages/OpdsSettings";
import { LanTransfer } from "./pages/LanTransfer";
import { SourceBooks } from "./pages/SourceBooks";
import { SearchPanel } from "./components/SearchPanel";
import { TitleBar } from "./components/TitleBar";
import { ToastContainer } from "./components/Toast";
import "./App.css";

function App() {
  const { currentBook, loadBooks } = useAppStore();
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadBooks().catch((e) => {
      console.error("loadBooks failed:", e);
    });
  }, [loadBooks]);

  // Apply persisted theme on mount
  useEffect(() => {
    const theme = useAppStore.getState().theme;
    document.documentElement.classList.remove("dark", "sepia");
    if (theme !== "light") document.documentElement.classList.add(theme);
  }, []);

  // Global keyboard shortcut: Ctrl+Shift+F for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        setShowSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listen for open-search event from Reader (Ctrl+F)
  useEffect(() => {
    const handleOpenSearch = () => setShowSearch(true);
    window.addEventListener("open-search", handleOpenSearch);
    return () => window.removeEventListener("open-search", handleOpenSearch);
  }, []);

  // Listen for search-with-text event from HighlightPopover
  useEffect(() => {
    const handleSearchWithText = (e: CustomEvent<{ text: string }>) => {
      setSearchQuery(e.detail?.text || "");
      setShowSearch(true);
    };
    window.addEventListener("search-with-text", handleSearchWithText as EventListener);
    return () => window.removeEventListener("search-with-text", handleSearchWithText as EventListener);
  }, []);

  // Auto-navigate to reader when a book is opened, back to library when closed.
  // Only reacts to actual transitions (tracked via ref) so deep links like
  // opening /stats directly are not kicked back to the library on mount.
  const prevBookRef = useRef(currentBook);
  useEffect(() => {
    const prev = prevBookRef.current;
    prevBookRef.current = currentBook;
    if (!prev && currentBook) {
      navigate("/reader");
    } else if (prev && !currentBook) {
      navigate("/");
    }
  }, [currentBook, navigate]);

  const isComic = currentBook?.kind === "comic";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar />
      <div className="flex-1 min-h-0 relative">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/sync" element={<SyncSettings />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/opds" element={<OpdsSettings />} />
          <Route path="/source" element={<SourceBooks />} />
          <Route path="/transfer" element={<LanTransfer />} />
          <Route
            path="/reader"
            element={
              currentBook ? (
                isComic ? <ComicReader /> : <Reader />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <SearchPanel
          visible={showSearch}
          onClose={() => { setShowSearch(false); setSearchQuery(""); }}
          query={searchQuery}
        />
        <ToastContainer />
      </div>
    </div>
  );
}

export default App;
