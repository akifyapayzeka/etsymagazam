"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

interface Product {
  id: string;
  title: string;
  status: string;
  productType: string;
  category: string;
  createdAt: string;
  listings: Array<{ id: string; state: string; priceAmount: string; etsyListingId: string | null }>;
}

const STATUS_TONE: Record<string, string> = {
  PUBLISHED: "bg-green-100 text-green-800",
  READY_TO_PUBLISH: "bg-blue-100 text-blue-800",
  IN_PRODUCTION: "bg-stone-100 text-stone-600",
  IN_QA: "bg-stone-100 text-stone-600",
  QA_FAILED: "bg-red-100 text-red-800",
  IP_REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-red-100 text-red-800",
  DEACTIVATED: "bg-amber-100 text-amber-800",
};

export default function ProductsPage() {
  const { loading } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    if (loading) return;
    apiFetch<Product[]>("/api/dashboard/products").then(setProducts).catch(() => undefined);
  }, [loading]);

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-4 text-lg font-semibold">Products</h1>
        {!products ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-stone-500">No products yet — connect Etsy and let Trend Scout find an opportunity.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2">Title</th>
                <th className="py-2">Status</th>
                <th className="py-2">Type</th>
                <th className="py-2">Price</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-stone-100">
                  <td className="py-2 font-medium">{p.title}</td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_TONE[p.status] ?? "bg-stone-100 text-stone-600"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2 text-stone-500">{p.productType}</td>
                  <td className="py-2 text-stone-500">
                    {p.listings[0] ? `$${Number(p.listings[0].priceAmount).toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 text-stone-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
