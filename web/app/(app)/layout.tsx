import Link from "next/link";
import { requireUser, signOut } from "@/lib/auth";

const LINKS = [
  ["/", "Meetings"],
  ["/upload", "Upload"],
  ["/action-items", "Action items"],
  ["/findings", "Findings"],
  ["/search", "Search"],
] as const;

const ADMIN_LINKS = [
  ["/clients", "Clients"],
  ["/admin/users", "Users"],
  ["/admin/jobs", "Jobs"],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = user.role === "ADMIN" ? [...LINKS, ...ADMIN_LINKS] : LINKS;

  return (
    <>
      <header className="no-print relative border-b-2 border-ink bg-pink">
        <div aria-hidden className="stipple fade-right pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="display text-2xl">Meeting Notes</Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
            {links.map(([href, text]) => (
              <Link key={href} href={href} className="hover:text-rust">{text}</Link>
            ))}
          </nav>
          <form
            className="ml-auto flex items-center gap-3 text-sm"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <span className="text-muted">{user.name}</span>
            <button className="link cursor-pointer">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </>
  );
}
