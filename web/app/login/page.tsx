import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { currentUser, signIn } from "@/lib/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;

  async function login(form: FormData) {
    "use server";
    try {
      await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirectTo: "/" });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1");
      throw e;
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 size-[640px] rounded-full bg-pink" />
      <div aria-hidden className="stipple-coarse fade-radial pointer-events-none absolute -left-40 -top-40 size-[640px] opacity-70" />
      <div aria-hidden className="stipple-rust fade-radial pointer-events-none absolute -bottom-52 -right-32 size-[560px]" />

      <form action={login} className="card relative w-full max-w-sm p-7">
        <h1 className="display text-5xl">Meeting<br />Notes</h1>
        <p className="mt-2 text-sm text-muted">QRYX internal. Sign in to continue.</p>
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          {error && <p className="text-sm text-alert">Wrong email or password.</p>}
          <button className="btn w-full justify-center">Sign in</button>
        </div>
      </form>
    </main>
  );
}
