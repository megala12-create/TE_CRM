import Link from "next/link";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-slate-500">Ask your administrator to grant the permission in Setup → Roles &amp; permissions.</p>
        <Link href="/" className="link mt-4 inline-block text-sm">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
