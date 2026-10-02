import { useEffect, useState } from "react";
import type { Profile } from "./types";
import { useProfile, useSaveProfile } from "./profile";

type SectionKey = "preferences" | "schedule" | "styleRules";

/** Local editable copy of one profile section with dirty tracking and save. */
export function useSectionForm<K extends SectionKey>(key: K) {
  const { data: profile, isLoading } = useProfile();
  const save = useSaveProfile();
  const [value, setValue] = useState<Profile[K] | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile && !dirty) setValue(profile[key]);
  }, [profile, dirty, key]);

  const update = (fn: (v: Profile[K]) => Profile[K]) => {
    setValue((v) => (v ? fn(v) : v));
    setDirty(true);
  };

  return {
    profile,
    isLoading: isLoading || !value,
    value,
    update,
    dirty,
    save,
    onSave: async () => {
      if (!value) return;
      await save.mutateAsync({ [key]: value } as Partial<Profile>);
      setDirty(false);
    },
    onReset: () => {
      if (profile) setValue(profile[key]);
      setDirty(false);
    },
  };
}
