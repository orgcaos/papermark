import { SETTINGS_NAV_ITEMS } from "@/lib/constants/settings-nav";

import { NavMenu } from "../navigation-menu";

export function SettingsHeader() {
  return (
    <header>
      <section className="mb-4 flex items-center justify-between md:mb-8 lg:mb-12">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Settings
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Manage your account, domains, and link preferences
          </p>
        </div>
      </section>

      <NavMenu navigation={[...SETTINGS_NAV_ITEMS]} />
    </header>
  );
}
