import { useEffect, useState } from "react";
import { useAppStore } from "./stores/app";
import { Library } from "./pages/Library";
import { Reader } from "./pages/Reader";
import { ComicReader } from "./pages/ComicReader";
import { Stats } from "./pages/Stats";
import { SyncSettings } from "./pages/SyncSettings";
import { SearchPanel } from "./components/SearchPanel";
import "./App.css";

type Page = "library" | "reader" | "stats" | "sync";

function App() {
  const { currentBook, loadBooks, theme } = useAppStore();
  const [showSearch, setShowSearch] = useState(false);
  const [page, setPage] = useState<Page>("library");

  useEffect(() => {
    loadBooks();
  }, []);

  useEffect(() => {
    document.documentElement.className = theme === "light" ? "" : theme;
  }, [theme]);

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

  // Auto-navigate to reader when book is opened
  useEffect(() => {
    if (currentBook && page === "library") {
      setPage("reader");
    }
  }, [currentBook]);

  if (page === "stats") {
    return <Stats onClose={() => setPage("library")} />;
  }

  if (page === "sync") {
    return <SyncSettings onClose={() => setPage("library")} />;
  }

  const isComic = currentBook?.kind === "comic";

  return (
    <>
      {currentBook || page === "reader" ? (
        isComic ? <ComicReader /> : <Reader />
      ) : (
        <Library
          onShowStats={() => setPage("stats")}
          onShowSync={() => setPage("sync")}
        />
      )}
      <SearchPanel
        visible={showSearch}
        onClose={() => setShowSearch(false)}
      />
    </>
  );
}

export default App;
