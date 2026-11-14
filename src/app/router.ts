import { useEffect, useState } from "react";

export function useHashPath(): string {
  const read = () => (location.hash.startsWith("#/") ? location.hash.slice(1).split("?")[0] : "");
  const [p, setP] = useState(read);
  useEffect(() => {
    const on = () => setP(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return p;
}
export const go = (path: string) => {
  location.hash = "#" + path;
};
export const hashQuery = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
