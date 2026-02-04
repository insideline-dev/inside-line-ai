import { create } from "zustand";

// Example Zustand store for local UI state
// For server state, prefer React Query (useTodos hooks)

interface TodoFilters {
  search: string;
  sortBy: "createdAt" | "title";
  sortOrder: "asc" | "desc";
}

interface TodoUIState {
  filters: TodoFilters;
  selectedTodoId: string | null;
  isCreateDialogOpen: boolean;

  // Actions
  setSearch: (search: string) => void;
  setSortBy: (sortBy: TodoFilters["sortBy"]) => void;
  setSortOrder: (sortOrder: TodoFilters["sortOrder"]) => void;
  setSelectedTodoId: (id: string | null) => void;
  setCreateDialogOpen: (open: boolean) => void;
  resetFilters: () => void;
}

const defaultFilters: TodoFilters = {
  search: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

export const useTodoUIStore = create<TodoUIState>((set: (state: any) => void) => ({
  filters: defaultFilters,
  selectedTodoId: null,
  isCreateDialogOpen: false,

  setSearch: (search: string) =>
    set((state: TodoUIState) => ({ filters: { ...state.filters, search } })),

  setSortBy: (sortBy: TodoFilters["sortBy"]) =>
    set((state: TodoUIState) => ({ filters: { ...state.filters, sortBy } })),

  setSortOrder: (sortOrder: TodoFilters["sortOrder"]) =>
    set((state: TodoUIState) => ({ filters: { ...state.filters, sortOrder } })),

  setSelectedTodoId: (id: string | null) => set({ selectedTodoId: id }),

  setCreateDialogOpen: (open: boolean) => set({ isCreateDialogOpen: open }),

  resetFilters: () => set({ filters: defaultFilters }),
}));

