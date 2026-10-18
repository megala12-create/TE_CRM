import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/app-frame";
import { destroySession, requireUser } from "@/server/auth";
import { NAVIGATION, type NavItem } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth";

function visibleNav(user: CurrentUser): NavItem[] {
  const allowed = (anyOf: NavItem["anyOf"]) => anyOf.length === 0 || anyOf.some((p) => can(user, p));
  return NAVIGATION.flatMap((item) => {
    if (!allowed(item.anyOf)) return [];
    if (!item.children) return [item];
    const children = item.children.filter((c) => allowed(c.anyOf));
    return children.length ? [{ ...item, children }] : [];
  });
}

async function logout() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppFrame nav={visibleNav(user)} user={{ name: user.name, email: user.email, roleName: user.roleName }} logout={logout}>
      {children}
    </AppFrame>
  );
}
