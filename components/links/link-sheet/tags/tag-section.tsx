import Link from "next/link";

import { Dispatch, SetStateAction, useMemo, useState } from "react";

import { PlanEnum } from "@/ee/stripe/constants";
import { CircleHelpIcon, Tag } from "lucide-react";
import { toast } from "sonner";
import { mutate } from "swr";

import { usePlan } from "@/lib/swr/use-billing";
import { useTags } from "@/lib/swr/use-tags";
import { TagProps } from "@/lib/types";

import { UpgradePlanModal } from "@/components/billing/upgrade-plan-modal";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select-v2";
import { BadgeTooltip } from "@/components/ui/tooltip";

import { DEFAULT_LINK_TYPE } from "..";

function getTagOption(tag: TagProps) {
  return {
    value: tag.id,
    label: tag.name,
    icon: (
      <Tag
        size={20}
        className={`rounded-sm border border-gray-200 bg-${tag.color}-100 p-1 dark:text-primary-foreground`}
      />
    ),
    meta: { color: tag.color, description: tag.description },
  };
}

export default function TagSection({
  data,
  setData,
  teamId,
}: {
  data: DEFAULT_LINK_TYPE;
  setData: Dispatch<SetStateAction<DEFAULT_LINK_TYPE>>;
  teamId: string;
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(
    data.tags || [],
  );
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { isFree } = usePlan();

  const {
    tagCount,
    tags: availableTags,
    loading: loadingTags,
  } = useTags({
    query: {
      sortBy: "createdAt",
      sortOrder: "desc",
    },
  });

  const options = useMemo(
    () => availableTags?.map((tag) => getTagOption(tag)),
    [availableTags],
  );

  // Callback to handle value change
  const handleValueChange = (value: string[]) => {
    setSelectedValues(value);
    setData((prevData) => ({
      ...prevData,
      tags: value,
    }));
  };

  const createTag = async (tag: string) => {
    if (isFree && tagCount && tagCount >= 5) {
      setShowUpgradeModal(true);
      toast.error("You have reached the maximum number of tags.");
      return false;
    }

    const res = await fetch(`/api/teams/${teamId}/tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: tag }),
    });
    if (!res.ok) {
      // Defensively parse: a non-JSON error body (a proxy's HTML error
      // page, an empty response) would otherwise throw here and propagate
      // uncaught, which used to leave the "Create ..." row's spinner stuck
      // on forever (see multi-select-v2.tsx's onSelect for the actual fix
      // to that symptom) instead of showing an error and re-enabling input.
      let message = "Failed to create tag";
      try {
        const body = await res.json();
        message = body?.error ?? message;
      } catch (error) {
        // no-op: fall back to the generic message above
      }
      toast.error(message);
      return false;
    }

    const newTag = await res.json();
    await mutate(
      `/api/teams/${teamId}/tags?${new URLSearchParams({
        sortBy: "createdAt",
        sortOrder: "desc",
        includeLinksCount: false,
      } as Record<string, any>).toString()}`,
    );
    setSelectedValues([...selectedValues, newTag.id]);
    setData((prevData) => ({
      ...prevData,
      tags: [...prevData.tags, newTag.id],
    }));
    setIsPopoverOpen(false);
    toast.success(`Successfully created tag!`);
    return true;
  };

  return (
    <>
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor="link-domain">Tags</Label>
          <BadgeTooltip
            content="Group links by tags to organize and track performance"
            link="https://www.papermark.com/help/article/tag-links"
          >
            <CircleHelpIcon className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground" />
          </BadgeTooltip>
        </div>
        <Link
          href={`/settings/tags`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Manage
        </Link>
      </div>
      <div className="flex">
        <MultiSelect
          loading={loadingTags}
          options={options ?? []}
          value={selectedValues}
          setIsPopoverOpen={setIsPopoverOpen}
          isPopoverOpen={isPopoverOpen}
          onValueChange={handleValueChange}
          placeholder="Select tags..."
          maxCount={3}
          searchPlaceholder="Search or add tags..."
          onCreate={(search) => createTag(search)}
        />
      </div>
      {showUpgradeModal && (
        <UpgradePlanModal
          clickedPlan={PlanEnum.Pro}
          trigger="create_tag"
          open={showUpgradeModal}
          setOpen={setShowUpgradeModal}
        />
      )}
    </>
  );
}
