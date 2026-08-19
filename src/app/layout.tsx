import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemePicker, type ThemeName } from "@/components/theme-picker";
import { currentUser } from "@/lib/auth";
import { rawgConfigured } from "@/lib/providers/rawg";
import { logoutAction } from "./actions";
import "./globals.css";

export const metadata: Metadata = { title: "media-list", description: "Small self-hosted media tracker" };

const themes = new Set<ThemeName>(["mocha", "latte", "soft-dark", "soft-light"]);

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  const showRawgAttribution = rawgConfigured();
  const storedTheme = (await cookies()).get("media-list-theme")?.value as ThemeName | undefined;
  const theme: ThemeName = storedTheme && themes.has(storedTheme) ? storedTheme : "mocha";
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <header className="topbar">
          <Link className="brand" href="/">media-list</Link>
          <nav>
            {user && <><Link href="/media/new">Add</Link><Link href="/import">Import / Export</Link>{user.role === "ADMIN" && <Link href="/admin">Users</Link>}<span className="muted userName">{user.username}</span><form action={logoutAction}><button className="linkButton" type="submit">Log out</button></form></>}
            <Link href="/about">About</Link>
            <ThemePicker initialTheme={theme} />
          </nav>
        </header>
        <main className="container">{children}</main>
        {showRawgAttribution && <footer className="container providerCredit"><a href="https://rawg.io" target="_blank" rel="noreferrer">Game data by RAWG</a></footer>}
      </body>
    </html>
  );
}
