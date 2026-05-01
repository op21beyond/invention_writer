import { create } from "zustand";

interface UiStore {
  showSettings: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  showSettings: false,
  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
  closeSettings: () => set({ showSettings: false }),
}));
