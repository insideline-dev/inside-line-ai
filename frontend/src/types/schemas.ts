export type Uuid = string;

export interface Todo {
  id: Uuid;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  completed?: boolean;
}

export interface TodoResponse {
  success: boolean;
  data: Todo;
}

export interface TodoListResponse {
  success: boolean;
  data: Todo[];
}

export interface IdResponse {
  success: boolean;
  data: { id: Uuid };
}
