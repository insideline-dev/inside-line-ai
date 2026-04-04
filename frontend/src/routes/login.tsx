import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useRequestMagicLink,
  useCurrentUser,
  useRedeemInvite,
  useJoinWaitlist,
} from "@/lib/auth";
import { env } from "@/env";
import { safeRedirect } from "@/lib/utils";
import insideLineLogo from "@/assets/icon-insideline.svg";

const magicLinkSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

const waitlistSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  companyName: z.string().min(1, "Company name is required").max(180),
  role: z.string().min(1, "Role is required").max(120),
  website: z.string().url("Must be a valid URL").max(500),
  consentToShareInfo: z.boolean().refine((value) => value, {
    message: "You must consent to sharing your submitted company information",
  }),
  consentToEarlyAccess: z.boolean().refine((value) => value, {
    message:
      "You must confirm you are requesting early access to the public beta",
  }),
});

const searchSchema = z.object({
  redirect: z.string().optional(),
  error: z.string().optional(),
  invite: z.string().optional(),
  view: z.enum(["waitlist"]).optional(),
});

type MagicLinkFormValues = z.infer<typeof magicLinkSchema>;
type WaitlistFormValues = z.infer<typeof waitlistSchema>;

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { data: user, isLoading: isCheckingAuth } = useCurrentUser();
  const { redirect, error, invite, view } = Route.useSearch();
  const waitlistOnly = view === "waitlist";

  const [authMode, setAuthMode] = useState<"magic" | "waitlist">(
    waitlistOnly ? "waitlist" : "magic",
  );

  const magicLinkMutation = useRequestMagicLink();
  const waitlistMutation = useJoinWaitlist();
  const redeemInviteMutation = useRedeemInvite();
  const didRedeemInvite = useRef(false);

  const magicLinkForm = useForm<MagicLinkFormValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  const waitlistForm = useForm<WaitlistFormValues>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      name: "",
      email: "",
      companyName: "",
      role: "Founder",
      website: "",
      consentToShareInfo: false,
      consentToEarlyAccess: false,
    },
  });

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (redirect) {
      sessionStorage.setItem("redirectAfterAuth", safeRedirect(redirect, "/"));
    }
  }, [redirect]);

  useEffect(() => {
    if (waitlistOnly) {
      setAuthMode("waitlist");
    }
  }, [waitlistOnly]);

  useEffect(() => {
    if (env.VITE_MOCK_AUTH) {
      navigate({ to: safeRedirect(redirect, "/role-select"), replace: true });
      return;
    }

    if (!isCheckingAuth && user) {
      const defaultRoute = user.onboardingCompleted
        ? `/${user.role}`
        : "/role-select";
      navigate({ to: safeRedirect(redirect, defaultRoute), replace: true });
    }
  }, [isCheckingAuth, user, redirect, navigate]);

  useEffect(() => {
    if (!invite || didRedeemInvite.current) {
      return;
    }

    didRedeemInvite.current = true;
    redeemInviteMutation.mutate(
      { token: invite },
      {
        onSuccess: (data) => {
          toast.success(data.message);
          magicLinkForm.setValue("email", data.email);
          waitlistForm.setValue("email", data.email);
          if (!waitlistOnly) {
            setAuthMode("magic");
          }
          navigate({
            to: "/login",
            search: (prev) => ({
              ...prev,
              invite: undefined,
            }),
            replace: true,
          });
        },
        onError: (err) => {
          toast.error(err.message || "Invalid or expired invite link");
        },
      },
    );
  }, [
    invite,
    redeemInviteMutation,
    magicLinkForm,
    waitlistForm,
    navigate,
    waitlistOnly,
  ]);

  const onMagicLink = (values: MagicLinkFormValues) => {
    magicLinkMutation.mutate(values, {
      onSuccess: () => {
        toast.success("Magic link sent! Check your email.");
        magicLinkForm.reset({ email: values.email });
      },
      onError: (err) => toast.error(err.message || "Failed to send magic link"),
    });
  };

  const onJoinWaitlist = (values: WaitlistFormValues) => {
    waitlistMutation.mutate(values, {
      onSuccess: (res) => {
        toast.success(res.message || "You have been added to the waitlist");
      },
      onError: (err) => {
        toast.error(err.message || "Failed to join waitlist");
      },
    });
  };

  const isLoading =
    magicLinkMutation.isPending ||
    waitlistMutation.isPending ||
    redeemInviteMutation.isPending;

  const waitlistFormContent = (
    <Form {...waitlistForm}>
      <form
        onSubmit={waitlistForm.handleSubmit(onJoinWaitlist)}
        className="space-y-4"
      >
        <FormField
          control={waitlistForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input disabled={isLoading} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={waitlistForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" disabled={isLoading} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={waitlistForm.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name</FormLabel>
              <FormControl>
                <Input disabled={isLoading} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={waitlistForm.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input disabled={isLoading} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={waitlistForm.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  disabled={isLoading}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={waitlistForm.control}
          name="consentToShareInfo"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(Boolean(checked))
                  }
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I agree to share the company information I provide for
                  waitlist review.
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={waitlistForm.control}
          name="consentToEarlyAccess"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(Boolean(checked))
                  }
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I want early access to the public beta and accept that access
                  is not guaranteed.
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {waitlistMutation.isPending ? "Submitting..." : "Join Waitlist"}
        </Button>
      </form>
    </Form>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <img src={insideLineLogo} alt="Inside Line" className="size-10 shrink-0" />
          <span className="font-serif text-3xl font-normal tracking-tight text-foreground">
            Inside Line
          </span>
        </div>
        <p className="text-muted-foreground mt-2">
          AI-Powered Venture Decision Intelligence
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{waitlistOnly ? "Join Waitlist" : "Sign In"}</CardTitle>
          <CardDescription>
            {waitlistOnly
              ? "Apply for early access to the public beta."
              : "Magic link sign in with optional waitlist enrollment."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* {!waitlistOnly && ( */}
          {/*   <> */}
          {/*     <Button */}
          {/*       type="button" */}
          {/*       variant="outline" */}
          {/*       onClick={googleSignIn} */}
          {/*       disabled={isLoading} */}
          {/*       className="w-full" */}
          {/*     > */}
          {/*       Continue with Google */}
          {/*     </Button> */}
          {/**/}
          {/*     <div className="relative"> */}
          {/*       <div className="absolute inset-0 flex items-center"> */}
          {/*         <span className="w-full border-t" /> */}
          {/*       </div> */}
          {/*       <div className="relative flex justify-center text-xs uppercase"> */}
          {/*         <span className="bg-background px-2 text-muted-foreground">Or</span> */}
          {/*       </div> */}
          {/*     </div> */}
          {/*   </> */}
          {/* )} */}

          {waitlistOnly ? (
            waitlistFormContent
          ) : (
            <Tabs
              value={authMode}
              onValueChange={(value) =>
                setAuthMode(value as "magic" | "waitlist")
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="magic">Magic Link</TabsTrigger>
                <TabsTrigger value="waitlist">Join Waitlist</TabsTrigger>
              </TabsList>

              <TabsContent value="magic" className="mt-4">
                <Form {...magicLinkForm}>
                  <form
                    onSubmit={magicLinkForm.handleSubmit(onMagicLink)}
                    className="space-y-4"
                  >
                    <FormField
                      control={magicLinkForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="you@example.com"
                              disabled={isLoading}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                    >
                      {magicLinkMutation.isPending
                        ? "Sending..."
                        : "Send Magic Link"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      We&apos;ll email you a secure sign-in link.
                    </p>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="waitlist" className="mt-4">
                {waitlistFormContent}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
