"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useState } from "react";

import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { z } from "zod";

import { cn } from "@/lib/utils";

import { LastUsed, useLastUsed } from "@/components/hooks/useLastUsed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// NextAuth sends failed sign-ins back here as /login?error=<code>.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  Verification:
    "That login code has expired or was already used. Request a new one.",
  EmailSignin: "The login email could not be sent. Try again.",
  SessionRequired: "Please sign in to continue.",
  AccessDenied: "This email address can't sign in to Orgcaos Docket.",
  default: "Sign-in didn't go through. Request a new code to try again.",
};

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next =
    searchParams?.get("next") ?? searchParams?.get("callbackUrl") ?? undefined;
  const authError = searchParams?.get("error");
  const authErrorMessage = authError
    ? (AUTH_ERROR_MESSAGES[authError] ?? AUTH_ERROR_MESSAGES.default)
    : null;

  const [lastUsed, setLastUsed] = useLastUsed();
  const authMethods = ["email"] as const;
  type AuthMethod = (typeof authMethods)[number];
  const [clickedMethod, setClickedMethod] = useState<AuthMethod | undefined>(
    undefined,
  );
  const [email, setEmail] = useState<string>("");
  const [emailButtonText, setEmailButtonText] = useState<string>(
    "Continue with Email",
  );

  const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { message: "Please enter a valid email." })
    .email({ message: "Please enter a valid email." });

  const emailValidation = emailSchema.safeParse(email);

  return (
    <div className="flex h-screen w-full flex-wrap">
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="z-10 mx-5 h-fit w-full max-w-md overflow-hidden sm:mx-0">
          <div className="items-left flex flex-col space-y-3 px-4 py-6 pt-5 sm:px-12 sm:pt-6">
            <Link href="/">
              <img
                src="/_static/orgcaos-logo.svg"
                alt="Orgcaos Docket"
                className="mb-24 h-[37.625rem] w-full max-w-full object-contain sm:mb-20"
              />
            </Link>
            <Link href="/">
              <span className="text-balance text-3xl font-semibold text-gray-900">
                Orgcaos Docket
              </span>
            </Link>
          </div>
          {authErrorMessage && (
            <p
              className="mx-4 rounded-[4px] bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-12"
              role="alert"
            >
              {authErrorMessage}
            </p>
          )}
          <form
            className="flex flex-col gap-4 px-4 pt-4 sm:px-12"
            onSubmit={(e) => {
              e.preventDefault();
              if (!emailValidation.success) {
                toast.error(emailValidation.error.errors[0].message);
                return;
              }

              setClickedMethod("email");
              signIn("email", {
                email: emailValidation.data,
                redirect: false,
                ...(next && next.length > 0 ? { callbackUrl: next } : {}),
              }).then((res) => {
                if (res?.ok && !res?.error) {
                  setLastUsed("credentials");
                  // Store email in sessionStorage for the verification page
                  try {
                    sessionStorage.setItem(
                      "pendingVerificationEmail",
                      emailValidation.data,
                    );
                  } catch {
                    // sessionStorage not available, verification page will show email input
                  }
                  router.push("/auth/email");
                } else {
                  setEmailButtonText("Error sending email - try again?");
                  toast.error("Error sending email - try again?");
                  setClickedMethod(undefined);
                }
              });
            }}
          >
            <Label className="sr-only" htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              placeholder="name@example.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={clickedMethod === "email"}
              // pattern={patternSimpleEmailRegex}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                "flex h-10 w-full rounded-[4px] border-0 bg-background bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white",
                email.length > 0 && !emailValidation.success
                  ? "ring-red-500"
                  : "ring-gray-200",
              )}
            />
            <div className="relative">
              <Button
                type="submit"
                loading={clickedMethod === "email"}
                disabled={!emailValidation.success || !!clickedMethod}
                className={cn(
                  "focus:shadow-outline w-full transform rounded-[4px] px-4 py-2 text-white transition-colors duration-300 ease-in-out focus:outline-none disabled:opacity-100",
                  "bg-black hover:bg-gray-900",
                )}
              >
                {emailButtonText}
              </Button>
              {lastUsed === "credentials" && <LastUsed />}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
