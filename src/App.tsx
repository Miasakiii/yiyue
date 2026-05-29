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
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    loadBooks().catch((e) => {
      setInitError(`loadBooks failed: ${e}`);
    });
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

  // Auto-navigate to reader when book is opened, back to library when closed
  useEffect(() => {
    if (currentBook && page === "library") {
      setPage("reader");
    } else if (!currentBook && page === "reader") {
      setPage("library");
    }
  }, [currentBook]);

  // Show init error if any
  if (initError) {
    return (
      <div
        style={{
          padding: 40,
          fontFamily: "monospace",
          background: "#fff",
          color: "#ef4444",
          height: "100vh",
        }}
      >
        <h2>初始化错误</h2>
        <pre>{initError}</pre>
        <button
          style={{ marginTop: 16, padding: "8px 16px" }}
          onClick={() => window.location.reload()}
        >
          刷新
        </button>
      </div>
    );
  }

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
