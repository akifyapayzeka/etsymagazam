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
    apiFetch<{ email: string }>("/api/auth/me")
      .then((res) => setEmail(res.email))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  return { email, loading };
}
