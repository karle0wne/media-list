import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemePicker, type ThemeName } from "@/components/theme-picker";
import { ProviderCredits } from "@/components/provider-credits";
import { requireIdentity } from "@/lib/identity";
import { rawgConfigured } from "@/lib/providers/rawg";
import "./globals.css";
import "./secondary.css";
import "./ux-corrections.css";
export const metadata:Metadata={title:"media-list",description:"Small self-hosted media tracker"};const themes=new Set<ThemeName>(["mocha","latte","soft-dark","soft-light"]);
export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>){const user=await requireIdentity();const showRawg=rawgConfigured();const stored=(await cookies()).get("media-list-theme")?.value as ThemeName|undefined;const theme:ThemeName=stored&&themes.has(stored)?stored:"mocha";return <html lang="en" data-theme={theme}><body><header className="topbar"><Link className="brand" href="/">media-list</Link><nav><Link href="/media/new">Add</Link><Link href="/import">Import / Export</Link><span className="muted userName">{user.username}</span><ThemePicker initialTheme={theme}/></nav></header><main className="container">{children}</main><footer className="container providerCredit"><ProviderCredits showRawg={showRawg}/></footer></body></html>;}
