import { DmPage } from "@/components/dm-page";

type PageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export function generateStaticParams(): Array<{ threadId: string }> {
  return [{ threadId: "__static-placeholder__" }];
}

export default async function Page({ params }: PageProps) {
  const { threadId } = await params;
  return <DmPage threadId={threadId} />;
}
