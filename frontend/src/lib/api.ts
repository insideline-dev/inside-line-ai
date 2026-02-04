import {
  ApiError,
  TodosService,
  OpenAPI,
} from "./api-client";
import type {
  Todo,
  TodoListResponse,
  TodoResponse,
  IdResponse,
  CreateTodoInput,
  UpdateTodoInput,
} from "@/types/schemas";
import { env } from "@/env";
import { toast } from "sonner";

// Configure the generated client
const getApiBase = () => {
  const baseUrl = env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && baseUrl.includes("://server:")) {
    const port = baseUrl.split(":").pop();
    return `http://localhost:${port}`;
  }
  return baseUrl;
};

OpenAPI.BASE = getApiBase();
OpenAPI.WITH_CREDENTIALS = true;

export const apiClient = {
  todos: {
    list: async (): Promise<Todo[]> => {
      const response = await TodosService.getApiTodos();
      return (response as TodoListResponse).data;
    },
    getById: async (id: string): Promise<Todo> => {
      const response = await TodosService.getApiTodos1(id);
      return (response as TodoResponse).data;
    },
    create: async (payload: CreateTodoInput): Promise<Todo> => {
      const response = await TodosService.postApiTodos(payload);
      return (response as TodoResponse).data;
    },
    update: async (id: string, payload: UpdateTodoInput): Promise<Todo> => {
      const response = await TodosService.patchApiTodos(id, payload);
      return (response as TodoResponse).data;
    },
    delete: async (id: string): Promise<{ id: string }> => {
      const response = await TodosService.deleteApiTodos(id);
      return (response as IdResponse).data;
    },
  },
};

export const handleApiError = (error: unknown) => {
  if (error instanceof ApiError) {
    const errorMessage =
      error.body?.error || error.body?.message || error.statusText || "An API error occurred";
    toast.error(errorMessage);
    return;
  }

  if (error instanceof Error) {
    toast.error(error.message);
    return;
  }

  toast.error("An unknown error occurred.");
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.body?.message || error.body?.error || error.statusText || "An API error occurred";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred.";
};

export { ApiError };
