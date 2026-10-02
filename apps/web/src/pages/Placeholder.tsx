import { Construction } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={<Construction className="size-8" />} title="Coming soon" description="This screen arrives in a later phase." />
      </Card>
    </>
  );
}
