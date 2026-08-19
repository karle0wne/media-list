"use client";

import { useState } from "react";

const themes = [
  ["mocha", "Catppuccin Mocha"],
  ["latte", "Catppuccin Latte"],
  ["soft-dark", "Soft dark"],
  ["soft-light", "Soft light"],
] as const;

export type ThemeName = (typeof themes)[number][0];

export function ThemePicker({ initialTheme }: { initialTheme: ThemeName }) {
  const [theme, setTheme] = useState(initialTheme);
  return <label className="themePicker">
    <span className="srOnly">Theme</span>
    <select value={theme} aria-label="Theme" onChange={(event) => {
      const next = event.target.value as ThemeName;
      setTheme(next);
      document.documentElement.dataset.theme = next;
      document.cookie = `media-list-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }}>
      {themes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  </label>;
}
