import { createContext, useContext, useState, type ReactNode } from "react";

import { getCookie, setCookie } from "@/lib/cookies";

export type Collapsible = "offcanvas" | "icon" | "none";
export type SidebarVariant = "inset" | "sidebar" | "floating";

const LAYOUT_COLLAPSIBLE_COOKIE_NAME = "layout_collapsible";
const LAYOUT_VARIANT_COOKIE_NAME = "layout_variant";
const LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const DEFAULT_VARIANT: SidebarVariant = "inset";
const DEFAULT_COLLAPSIBLE: Collapsible = "icon";

type LayoutContextValue = {
  resetLayout: () => void;
  defaultCollapsible: Collapsible;
  collapsible: Collapsible;
  setCollapsible: (collapsible: Collapsible) => void;
  defaultVariant: SidebarVariant;
  variant: SidebarVariant;
  setVariant: (variant: SidebarVariant) => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

function readCollapsible(): Collapsible {
  const saved = getCookie(LAYOUT_COLLAPSIBLE_COOKIE_NAME);
  if (saved === "offcanvas" || saved === "icon" || saved === "none") {
    return saved;
  }
  return DEFAULT_COLLAPSIBLE;
}

function readVariant(): SidebarVariant {
  const saved = getCookie(LAYOUT_VARIANT_COOKIE_NAME);
  if (saved === "inset" || saved === "sidebar" || saved === "floating") {
    return saved;
  }
  return DEFAULT_VARIANT;
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [collapsible, setCollapsibleState] = useState<Collapsible>(readCollapsible);
  const [variant, setVariantState] = useState<SidebarVariant>(readVariant);

  function setCollapsible(next: Collapsible) {
    setCollapsibleState(next);
    setCookie(LAYOUT_COLLAPSIBLE_COOKIE_NAME, next, LAYOUT_COOKIE_MAX_AGE);
  }

  function setVariant(next: SidebarVariant) {
    setVariantState(next);
    setCookie(LAYOUT_VARIANT_COOKIE_NAME, next, LAYOUT_COOKIE_MAX_AGE);
  }

  function resetLayout() {
    setCollapsible(DEFAULT_COLLAPSIBLE);
    setVariant(DEFAULT_VARIANT);
  }

  return (
    <LayoutContext.Provider
      value={{
        resetLayout,
        defaultCollapsible: DEFAULT_COLLAPSIBLE,
        collapsible,
        setCollapsible,
        defaultVariant: DEFAULT_VARIANT,
        variant,
        setVariant,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (context === null) {
    throw new Error("useLayout must be used within LayoutProvider");
  }
  return context;
}
