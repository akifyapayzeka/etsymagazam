"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "./api-client";

/** Redirects to /login if there is no valid session; returns { email, loading }. */
export function useAuth() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiFetch<{ email: string }>("/api/auth/me")
      .then((res) => {
        if (!active) return;
        setEmail(res.email);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        router.replace("/login");
      });

    return () => {
      active = false;
    };
  }, [router]);

  return { email, loading };
}
