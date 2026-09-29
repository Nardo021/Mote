export function shouldProxyToRelay(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname === "/ready" ||
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/s/")
  );
}
