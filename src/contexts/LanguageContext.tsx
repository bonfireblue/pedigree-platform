"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, Language, TranslationKey } from "@/lib/translations";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  // Auto-detect Vietnam timezone on mount and check localStorage
  useEffect(() => {
    // Check localStorage first
    const savedLang = localStorage.getItem("pedigree-lang") as Language | null;
    if (savedLang && (savedLang === "en" || savedLang === "vi")) {
      setLangState(savedLang);
      return;
    }

    // Auto-detect Vietnam timezone
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === "Asia/Ho_Chi_Minh" || tz === "Asia/Saigon") {
        setLangState("vi");
        localStorage.setItem("pedigree-lang", "vi");
      }
    } catch {
      // Ignore timezone detection errors
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("pedigree-lang", newLang);
  };

  const t = translations[lang];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Language toggle component
export function LanguageToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "vi" : "en")}
      style={{
        background: "transparent",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 12,
        cursor: "pointer",
        color: "#6b7280",
        ...style,
      }}
    >
      {t.languageToggle}
    </button>
  );
}
