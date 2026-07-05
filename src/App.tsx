import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAppStore } from "./stores/app";
import { Library } from "./pages/Library";
import { Reader } from "./pages/Reader";
import { ComicReader } from "./pages/ComicReader";
import { Stats } from "./pages/Stats";
import { SyncSettings } from "./pages/SyncSettings";
import { Rules } from "./pages/Rules";
import { SearchPanel } from "./components/SearchPanel";
import { ToastContainer } from "./components/Toast";
import "./App.css";

function App() {
  const { currentBook, loadBooks } = useAppStore();
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);

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
      if (e.key === "f" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
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

  // Auto-navigate to reader when book is opened, back to library when closed
  useEffect(() => {
    if (currentBook) {
      navigate("/reader");
    } else {
      navigate("/");
    }
  }, [currentBook, navigate]);

  const isComic = currentBook?.kind === "comic";

  return (
    <>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/sync" element={<SyncSettings />} />
        <Route path="/rules" element={<Rules />} />
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
        onClose={() => setShowSearch(false)}
      />
      <ToastContainer />
    </>
  );
}

export default App;
