import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ItemDetailClient } from "@/components/ItemDetailClient";
import { getProductById, PRODUCTS } from "@/data/products";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) notFound();

  return (
    <PageShell>
      <ItemDetailClient product={product} />
    </PageShell>
  );
}
