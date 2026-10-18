import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-maroon-600 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Tiruppur Embossing" width={72} height={72} priority />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Tiruppur Embossing</h1>
          <p className="text-sm text-slate-500">Sign in to your CRM</p>
        </div>
        <LoginForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"} />
      </div>
    </main>
  );
}
