export const APP_BASE = process.env.NEXT_PUBLIC_APP_BASE ?? "/askfdalabel";
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/askfdalabel_api";
export const DASHBOARD_BASE = process.env.NEXT_PUBLIC_DASHBOARD_BASE ?? "/askfdalabel";

export const withAppBase = (path: string) => {
  if (!path.startsWith("/")) {
    return `${APP_BASE}/${path}`;
  }
  if (path.startsWith(APP_BASE)) {
    return path;
  }
  return `${APP_BASE}${path}`;
};

export const withDashboardBase = (path: string) => {
  if (!path.startsWith("/")) {
    return `${DASHBOARD_BASE}/${path}`;
  }
  if (path.startsWith(DASHBOARD_BASE)) {
    return path;
  }
  return `${DASHBOARD_BASE}${path}`;
};
