import type { Metadata } from "next";
import "./dashboard_style.css";
import "./dashboard_spl.css";
import "./themes/modern.css";

export const metadata: Metadata = {
  title: "AskFDALabel - Drug Label Analyzer",
  description: "The Intelligence Layer for Drug Safety & Analysis",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
}
