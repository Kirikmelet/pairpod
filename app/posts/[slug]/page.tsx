import { notFound } from "next/navigation";
import { getPostBySlug, posts, PostDetailPage } from "@/components/post-stream-page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return <PostDetailPage post={post} />;
}
