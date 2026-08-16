import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { logoutAction } from "./actions";
import "./globals.css";

export const metadata: Metadata = { title: "media-list", description: "Small self-hosted media tracker" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link className="brand" href="/">media-list</Link>
          <nav>
            {user && <><Link href="/media/new">Add</Link><Link href="/import">Import / Export</Link>{user.role === "ADMIN" && <Link href="/admin">Users</Link>}<span className="muted">{user.username}</span><form action={logoutAction}><button className="linkButton" type="submit">Log out</button></form></>}
            <Link href="/about">About</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
