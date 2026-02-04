import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";
import { env } from "@/env";

// Re-export the main useAuth hook from context
export { useAuth } from "@/contexts/AuthContext";

export async function signOut() {
  try {
    await authClient.signOut();
    queryClient.setQueryData(["session"], null);
    queryClient.invalidateQueries({ queryKey: ["session"] });
  } catch (error) {
    console.error("Sign out error:", error);
    throw error;
  }
}

export async function signInWithEmail(email: string, password: string, callbackURL?: string) {
  try {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: `${env.VITE_FRONTEND_BASE_URL}${callbackURL || "/"}`,
    });
    if (error) {
      throw new Error(error.message || "Sign in failed");
    }
    return data;
  } catch (error) {
    console.error("Email sign-in error:", error);
    throw error;
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
  callbackURL?: string
) {
  try {
    const { data, error } = await authClient.signUp.email({
      email,
      password,
      name,
      callbackURL: `${env.VITE_FRONTEND_BASE_URL}${callbackURL || "/"}`,
    });
    if (error) {
      throw new Error(error.message || "Sign up failed");
    }
    return data;
  } catch (error) {
    console.error("Email sign-up error:", error);
    throw error;
  }
}

export async function signInWithGoogle(callbackURL?: string) {
  try {
    const { data, error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${env.VITE_FRONTEND_BASE_URL}${callbackURL || "/"}`,
    });
    if (error) {
      throw new Error(error.message || "Google sign-in failed");
    }
    return data;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
}

