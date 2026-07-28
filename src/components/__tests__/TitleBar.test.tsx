import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the Tauri window API before importing the component (module-scope
// getCurrentWindow() call). vi.hoisted keeps the mock instance referencable.
const mocks = vi.hoisted(() => {
  const win = {
    minimize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    listen: vi.fn(() => Promise.resolve(() => {})),
  };
  return { win };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocks.win,
}));

import { TitleBar } from "../TitleBar";

describe("TitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.win.isMaximized.mockResolvedValue(false);
  });

  it("renders app identity and the three window controls", async () => {
    render(<TitleBar />);

    expect(screen.getByText("一页")).toBeTruthy();
    expect(screen.getByTitle("最小化")).toBeTruthy();
    expect(screen.getByTitle("最大化")).toBeTruthy();
    expect(screen.getByTitle("关闭")).toBeTruthy();
    // Initial maximize-state query + resize listener registration
    await waitFor(() => expect(mocks.win.isMaximized).toHaveBeenCalled());
    expect(mocks.win.listen).toHaveBeenCalledWith("tauri://resize", expect.any(Function));
  });

  it("invokes minimize / toggleMaximize / close on button clicks", async () => {
    render(<TitleBar />);
    await waitFor(() => expect(mocks.win.isMaximized).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("最小化"));
    expect(mocks.win.minimize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("最大化"));
    expect(mocks.win.toggleMaximize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("关闭"));
    expect(mocks.win.close).toHaveBeenCalledTimes(1);
  });

  it("toggles maximize on double-clicking the drag region", async () => {
    const { container } = render(<TitleBar />);
    await waitFor(() => expect(mocks.win.isMaximized).toHaveBeenCalled());

    const dragRegion = container.querySelector("[data-tauri-drag-region]");
    expect(dragRegion).toBeTruthy();
    fireEvent.doubleClick(dragRegion!);
    expect(mocks.win.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("shows 还原 when the window reports maximized", async () => {
    mocks.win.isMaximized.mockResolvedValue(true);
    render(<TitleBar />);

    await waitFor(() => expect(screen.getByTitle("还原")).toBeTruthy());
  });
});
