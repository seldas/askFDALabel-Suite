import type { Metadata } from "next";
import "./dashboard_style.css";
import "./dashboard_spl.css";

export const metadata: Metadata = {
  title: "AskFDALabel - Dashboard",
  description: "The Intelligence Layer for Drug Safety & Analysis",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-suite">
      <link id="theme-stylesheet" rel="stylesheet" href="/dashboard/themes/modern.css" />
      {children}
    </div>
  );
}
