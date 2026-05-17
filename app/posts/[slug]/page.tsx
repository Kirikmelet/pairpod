import { Suspense } from "react";
import { PostDetailPage } from "@/components/post-stream-page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): Array<{ slug: string }> {
  return [{ slug: "__static-placeholder__" }];
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="status-note">Loading post...</p>}>
      <PostDetailPage postId={slug} />
    </Suspense>
  );
}
