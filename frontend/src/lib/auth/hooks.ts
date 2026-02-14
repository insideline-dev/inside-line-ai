import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authApi } from "./api";
import { setAccessToken } from "./token";
import type {
  LoginRequest,
  RegisterRequest,
  MagicLinkRequest,
  JoinWaitlistRequest,
  RedeemInviteRequest,
} from "./types";

export const authKeys = {
  user: ["auth", "user"] as const,
};

function consumeRedirect(): string | null {
  const redirect = sessionStorage.getItem("redirectAfterAuth");
  if (redirect) sessionStorage.removeItem("redirectAfterAuth");
  return redirect;
}

// Current user query
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.user,
    queryFn: authApi.getCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false, // Don't retry auth failures
  });
}

// Login mutation
export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: LoginRequest) => authApi.login(data),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(authKeys.user, data.user);
      if (data.user.onboardingCompleted) {
        const redirect = consumeRedirect();
        navigate({ to: redirect || `/${data.user.role}` });
      } else {
        navigate({ to: "/role-select" });
      }
    },
  });
}

// Register mutation
export function useRegister() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: RegisterRequest) => authApi.register(data),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(authKeys.user, data.user);
      if (data.user.onboardingCompleted) {
        const redirect = consumeRedirect();
        navigate({ to: redirect || `/${data.user.role}` });
      } else {
        navigate({ to: "/role-select" });
      }
    },
  });
}

// Magic link mutations
export function useRequestMagicLink() {
  return useMutation({
    mutationFn: (data: MagicLinkRequest) => authApi.requestMagicLink(data),
  });
}

export function useRedeemInvite() {
  return useMutation({
    mutationFn: (data: RedeemInviteRequest) => authApi.redeemInvite(data),
  });
}

export function useJoinWaitlist() {
  return useMutation({
    mutationFn: (data: JoinWaitlistRequest) => authApi.joinWaitlist(data),
  });
}

export function useVerifyMagicLink() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (token: string) => authApi.verifyMagicLink(token),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(authKeys.user, data.user);
      if (data.user.onboardingCompleted) {
        const redirect = consumeRedirect();
        navigate({ to: redirect || `/${data.user.role}` });
      } else {
        navigate({ to: "/role-select" });
      }
    },
  });
}

// Email verification
export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => authApi.verifyEmail({ token }),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(authKeys.user, data.user);
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => authApi.resendVerification({ email }),
  });
}

// Logout mutation
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      setAccessToken(null);
      queryClient.setQueryData(authKeys.user, null);
      queryClient.removeQueries({ queryKey: authKeys.user });
      navigate({ to: "/login" });
    },
  });
}

// Logout all devices
export function useLogoutAll() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => {
      setAccessToken(null);
      queryClient.setQueryData(authKeys.user, null);
      queryClient.removeQueries({ queryKey: authKeys.user });
      navigate({ to: "/login" });
    },
  });
}

// Select role during onboarding
export function useSelectRole() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (role: "founder" | "investor") => authApi.selectRole(role),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(authKeys.user, data.user);
      const redirect = consumeRedirect();
      navigate({ to: redirect || `/${data.user.role}` });
    },
  });
}

// Google auth (redirect)
export function useGoogleAuth() {
  return {
    signIn: () => {
      window.location.href = authApi.getGoogleAuthUrl();
    },
  };
}
