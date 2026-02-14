import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
  useLogin,
  useRegister,
  useRequestMagicLink,
  useGoogleAuth,
  useCurrentUser,
} from "@/lib/auth";
import { env } from "@/env";
import { safeRedirect } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

const magicLinkSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

const searchSchema = z.object({
  redirect: z.string().optional(),
  error: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;
type MagicLinkFormValues = z.infer<typeof magicLinkSchema>;

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { data: user, isLoading: isCheckingAuth } = useCurrentUser();
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "magic">(
    "signin"
  );
  const { redirect, error } = Route.useSearch();

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const magicLinkMutation = useRequestMagicLink();
  const { signIn: googleSignIn } = useGoogleAuth();

  // Show error from OAuth callback
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Persist redirect intent to sessionStorage (survives OAuth full-page redirects)
  useEffect(() => {
    if (redirect) {
      sessionStorage.setItem("redirectAfterAuth", safeRedirect(redirect, "/"));
    }
  }, [redirect]);

  // Only auto-redirect if user was already logged in on page load.
  // Skip when a mutation just completed — hooks handle their own navigation.
  const skipAutoRedirect = loginMutation.isSuccess || registerMutation.isSuccess;

  useEffect(() => {
    if (env.VITE_MOCK_AUTH) {
      navigate({ to: safeRedirect(redirect, "/role-select"), replace: true });
      return;
    }
    if (!isCheckingAuth && user && !skipAutoRedirect) {
      const defaultRoute = user.onboardingCompleted
        ? `/${user.role}`
        : "/role-select";
      navigate({ to: safeRedirect(redirect, defaultRoute), replace: true });
    }
  }, [isCheckingAuth, user, redirect, navigate, skipAutoRedirect]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const magicLinkForm = useForm<MagicLinkFormValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  const onLogin = (values: LoginFormValues) => {
    loginMutation.mutate(values, {
      onSuccess: () => toast.success("Signed in successfully!"),
      onError: (err) => toast.error(err.message || "Sign in failed"),
    });
  };

  const onRegister = (values: RegisterFormValues) => {
    registerMutation.mutate(values, {
      onSuccess: () => toast.success("Account created! Check your email to verify."),
      onError: (err) => toast.error(err.message || "Sign up failed"),
    });
  };

  const onMagicLink = (values: MagicLinkFormValues) => {
    magicLinkMutation.mutate(values, {
      onSuccess: () => {
        toast.success("Magic link sent! Check your email.");
        magicLinkForm.reset();
      },
      onError: (err) => toast.error(err.message || "Failed to send magic link"),
    });
  };

  const isLoading =
    loginMutation.isPending ||
    registerMutation.isPending ||
    magicLinkMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-4xl font-bold tracking-tight text-foreground">
            Inside Line
          </span>
          <span className="text-primary font-semibold text-2xl">.AI</span>
        </div>
        <p className="text-muted-foreground mt-2">
          AI-Powered Venture Decision Intelligence
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {authMode === "signup"
              ? "Create Account"
              : authMode === "magic"
                ? "Magic Link"
                : "Welcome Back"}
          </CardTitle>
          <CardDescription>
            {authMode === "signup"
              ? "Sign up to get started"
              : authMode === "magic"
                ? "Sign in with a magic link"
                : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google Sign In */}
          <Button
            type="button"
            variant="outline"
            onClick={googleSignIn}
            disabled={isLoading}
            className="w-full"
          >
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          <Tabs
            value={authMode}
            onValueChange={(v) =>
              setAuthMode(v as "signin" | "signup" | "magic")
            }
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
              <TabsTrigger value="magic">Magic Link</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              <Form {...loginForm}>
                <form
                  onSubmit={loginForm.handleSubmit(onLogin)}
                  className="space-y-4"
                >
                  <FormField
                    control={loginForm.control}
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
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
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
                    {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <Form {...registerForm}>
                <form
                  onSubmit={registerForm.handleSubmit(onRegister)}
                  className="space-y-4"
                >
                  <FormField
                    control={registerForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Your name"
                            disabled={isLoading}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
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
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
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
                    {registerMutation.isPending
                      ? "Creating account..."
                      : "Create Account"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

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
                    We'll email you a link to sign in instantly
                  </p>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
