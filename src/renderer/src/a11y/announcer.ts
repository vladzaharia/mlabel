import { create } from "zustand";

interface AnnouncerState {
  polite: { message: string; seq: number };
  assertive: { message: string; seq: number };
}

interface AnnouncerActions {
  _announce: (message: string, politeness: "polite" | "assertive") => void;
}

type AnnouncerStore = AnnouncerState & AnnouncerActions;

export const useAnnouncer = create<AnnouncerStore>((set, get) => ({
  polite: { message: "", seq: 0 },
  assertive: { message: "", seq: 0 },

  _announce(message, politeness) {
    const current = get()[politeness];
    set({ [politeness]: { message, seq: current.seq + 1 } });
  },
}));

/** Announce a message via an ARIA live region. Callable from anywhere —
 *  including module-level code and non-React hooks. */
export function announce(message: string, politeness: "polite" | "assertive" = "polite"): void {
  useAnnouncer.getState()._announce(message, politeness);
}
