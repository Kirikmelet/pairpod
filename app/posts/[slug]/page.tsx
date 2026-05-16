import { Suspense } from "react";
import { PostDetailPage } from "@/components/post-stream-page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="status-note">Loading post...</p>}>
      <PostDetailPage postId={slug} />
    </Suspense>
  );
}
