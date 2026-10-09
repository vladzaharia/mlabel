import { createContext, useContext, type ReactNode } from "react";
import { ariaChord, formatChord, resolveBindings, type ResolvedBinding } from "@core";
import { useStore } from "../store/store";
import { isMac } from "../lib/utils";

/**
 * One answer to "what fires this?", for everything that shows or handles a key.
 *
 * Before this, the help dialog listed chords from a hardcoded table, the choice
 * hints read them off the config, and the keyboard handler had its own if-chain
 * — three places that could disagree, and two of which a user rebinding would
 * never have reached. Everything now reads the same resolved list.
 */
interface ShortcutContextValue {
  /** Every binding in force, in dispatch order. */
  bindings: readonly ResolvedBinding[];
  /** The first chord for a binding, formatted for this platform. */
  chordFor: (bindingId: string) => string | undefined;
  /** The same chord spelled for `aria-keyshortcuts`. */
  ariaFor: (bindingId: string) => string | undefined;
}

const EMPTY: ShortcutContextValue = {
  bindings: [],
  chordFor: () => undefined,
  ariaFor: () => undefined,
};

const ShortcutContext = createContext<ShortcutContextValue>(EMPTY);

export function ShortcutProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const config = useStore((s) => s.config);
  const configPath = useStore((s) => s.configPath);
  const overrides = useStore((s) => s.shortcutOverrides);

  const bindings = resolveBindings(config, configPath, overrides);
  const mac = isMac();
  const byId = new Map(bindings.map((b) => [b.id, b]));

  const firstChord = (bindingId: string): string | undefined => byId.get(bindingId)?.chords[0];

  const value: ShortcutContextValue = {
    bindings,
    chordFor: (bindingId) => {
      const chord = firstChord(bindingId);
      return chord === undefined ? undefined : formatChord(chord, mac);
    },
    ariaFor: (bindingId) => {
      const chord = firstChord(bindingId);
      return chord === undefined ? undefined : ariaChord(chord, mac);
    },
  };

  // The React Compiler memoises this object; hand-writing a `useMemo` here is
  // exactly what CLAUDE.md says not to do for new code.
  // oxlint-disable-next-line react/jsx-no-constructed-context-values
  return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>;
}

export const useShortcuts = (): ShortcutContextValue => useContext(ShortcutContext);
