import { NextPage } from "next";
import Link from "next/link";

import { useState } from "react";

import {
  type CredentialCreationOptionsJSON,
  create,
} from "@github/webauthn-json";
import { isReferralsEnabled } from "@/ee/features/partners/lib/referrals";
import { GiftIcon, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { usePasskeys } from "@/lib/swr/use-passkeys";
import { validateEmail } from "@/lib/utils/validate-email";

import { UpdateMailSubscribe } from "@/components/account/update-subscription";
import UploadAvatar from "@/components/account/upload-avatar";
import AppLayout from "@/components/layouts/app";
import { SettingsHeader } from "@/components/settings/settings-header";
import Passkey from "@/components/shared/icons/passkey";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";

/**
 * The merged "User Account" settings tab -- combines what used to be two
 * separate pages (pages/account/general.tsx: name/email/avatar, and
 * pages/account/security.tsx: passkeys) into one page, plus Change Theme
 * and Log out (moved off the old sidebar-footer dropdown, which this page
 * replaced -- see components/sidebar/nav-user.tsx). Added 2026-09-15 per
 * Savvas's request. The old /account/general and /account/security routes
 * now redirect here rather than being deleted outright, so any hardcoded
 * links to them (emails, breadcrumbs, mobile header) keep working -- same
 * approach as the existing /settings/general redirect.
 */
const AccountSettingsPage: NextPage = () => {
  const { data: session, update } = useSession();
  const { theme, setTheme } = useTheme();

  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const { passkeys, loading: isLoadingPasskeys, mutate } = usePasskeys();

  async function registerPasskey() {
    setIsRegisteringPasskey(true);
    const createOptionsResponse = await fetch("/api/passkeys/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: true, finish: false, credential: null }),
    });

    const { createOptions } = await createOptionsResponse.json();

    const credential = await create(
      createOptions as CredentialCreationOptionsJSON,
    );

    const response = await fetch("/api/passkeys/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: false, finish: true, credential }),
    });

    if (response.ok) {
      toast.success("Registered passkey successfully!");
      mutate();
      setIsRegisteringPasskey(false);
      return;
    }
    setIsRegisteringPasskey(false);
  }

  async function removePasskey(credentialId: string) {
    try {
      const response = await fetch("/api/account/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });

      if (response.ok) {
        toast.success("Passkey removed successfully!");
        mutate();
      } else {
        toast.error("Failed to remove passkey");
      }
    } catch (error) {
      console.error("Error removing passkey:", error);
      toast.error("Failed to remove passkey");
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <AppLayout>
      <main className="relative mx-2 mb-10 mt-4 space-y-8 overflow-hidden px-1 sm:mx-3 md:mx-5 md:mt-5 lg:mx-7 lg:mt-8 xl:mx-10">
        <SettingsHeader />

        <div className="space-y-6">
          <Form
            title="Your Name"
            description="This will be your display name on Orgcaos Docket."
            inputAttrs={{
              name: "name",
              placeholder: "Dino Hems",
              maxLength: 32,
            }}
            defaultValue={session?.user?.name ?? ""}
            helpText="Max 32 characters."
            handleSubmit={(data) =>
              fetch("/api/account", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
              }).then(async (res) => {
                if (res.status === 200) {
                  update();
                  toast.success("Successfully updated your name!");
                } else {
                  const { error } = await res.json();
                  toast.error(error?.message);
                }
              })
            }
          />
          <Form
            title="Your Email"
            description="This will be the email you use to log in to Orgcaos Docket and receive notifications. A confirmation is required for changes."
            inputAttrs={{
              name: "email",
              placeholder: "name@example.com",
              maxLength: 52,
              type: "email",
            }}
            defaultValue={session?.user?.email ?? ""}
            validate={validateEmail}
            helpText={<UpdateMailSubscribe />}
            handleSubmit={(data) =>
              fetch("/api/account", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
              }).then(async (res) => {
                if (res.status === 200) {
                  toast.success(
                    `A confirmation email has been sent to ${session?.user?.email}.`,
                  );
                } else {
                  const { error } = await res.json();
                  toast.error(error);
                }
              })
            }
          />
          <UploadAvatar
            title="Your Avatar"
            description="This is your avatar image on Orgcaos Docket."
            helpText="Square image recommended. Accepted file types: .png, .jpg. Max file
          size: 2MB."
          />

          {/* Register Passkey Section */}
          <div className="rounded-lg border border-muted p-10">
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-xl font-medium">Register a passkey</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Never use a password or oauth again. Register a passkey to
                  make logging in easy.
                </p>
              </div>
              <Button
                onClick={() => registerPasskey()}
                className="flex items-center justify-center space-x-2"
                disabled={isRegisteringPasskey}
              >
                <Passkey className="h-4 w-4" />
                <span>Register a new passkey</span>
              </Button>
            </div>
          </div>

          {/* Existing Passkeys Section */}
          <div className="rounded-lg border border-muted p-10">
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-xl font-medium">Your passkeys</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Manage your registered passkeys. You can remove passkeys you
                  no longer use.
                </p>
              </div>

              {isLoadingPasskeys ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">
                    Loading passkeys...
                  </div>
                </div>
              ) : passkeys.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">
                    No passkeys registered yet.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {passkeys.map((passkey) => (
                    <div
                      key={passkey.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center space-x-4">
                        <Passkey className="h-5 w-5 text-muted-foreground" />
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {passkey.name || "Unnamed Passkey"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Created: {formatDate(passkey.created_at)}
                            {passkey.last_used_at && (
                              <span className="ml-4">
                                Last used: {formatDate(passkey.last_used_at)}
                              </span>
                            )}
                          </div>
                          {passkey.transports &&
                            passkey.transports.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Transports: {passkey.transports.join(", ")}
                              </div>
                            )}
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove passkey</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove this passkey? This
                              action cannot be undone. You will need to register
                              a new passkey to continue using passwordless
                              authentication.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removePasskey(passkey.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Appearance, Earn and Refer, Log out -- moved here from the old
              sidebar-footer dropdown (components/sidebar/nav-user.tsx),
              2026-09-15. */}
          <div className="rounded-lg border border-muted p-10">
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-xl font-medium">Appearance</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Choose how Orgcaos Docket looks on this device.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                  className="flex items-center gap-1.5"
                >
                  <Sun className="h-4 w-4" />
                  Light
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                  className="flex items-center gap-1.5"
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("system")}
                  className="flex items-center gap-1.5"
                >
                  <Monitor className="h-4 w-4" />
                  System
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-muted p-6">
            {isReferralsEnabled() ? (
              <Link
                href="/partners"
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
              >
                <GiftIcon className="h-4 w-4" />
                Earn and Refer
              </Link>
            ) : (
              <span />
            )}
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() =>
                signOut({
                  callbackUrl: `${window.location.origin}`,
                })
              }
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default AccountSettingsPage;
