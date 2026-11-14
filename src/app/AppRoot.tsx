import { motion } from "framer-motion";
import { AppShell } from "./AppShell";
import { AuthProvider } from "./auth";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { AuthScreen, Gate } from "./pages/AuthScreen";
import { EventsPage } from "./pages/EventsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { PlanPage } from "./pages/PlanPage";
import { ReviewPage } from "./pages/ReviewPage";
import { TeamPage } from "./pages/TeamPage";
import { UploadPage } from "./pages/UploadPage";
import { useHashPath } from "./router";
import { ToastProvider } from "./ui";

/** True when the URL hash points at the manager app or a sign-in screen. */
export const isAppPath = (p: string) => p === "/login" || p === "/signup" || p === "/forgot" || p === "/app" || p.startsWith("/app/");

export function AppRoot() {
  const path = useHashPath();
  let body;
  if (path === "/login" || path === "/signup" || path === "/forgot") {
    body = (
      <motion.div key={path} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <AuthScreen mode={path === "/signup" ? "signup" : path === "/forgot" ? "forgot" : "login"} />
      </motion.div>
    );
  } else {
    const parts = path.split("/").filter(Boolean); // app, section, id
    const section = parts[1] ?? "";
    let page;
    if (section === "") page = <PlanPage />;
    else if (section === "upload") page = <UploadPage />;
    else if (section === "events") page = <EventsPage />;
    else if (section === "review" && parts[2]) page = <ReviewPage id={parts[2]} key={parts[2]} />;
    else if (section === "history") page = <HistoryPage />;
    else if (section === "team") page = <TeamPage />;
    else if (section === "account") page = <AccountPage />;
    else if (section === "admin") page = <AdminPage />;
    else page = <PlanPage />;
    body = (
      <Gate>
        <AppShell>{page}</AppShell>
      </Gate>
    );
  }
  return (
    <AuthProvider>
      <ToastProvider>
        {body}
      </ToastProvider>
    </AuthProvider>
  );
}
