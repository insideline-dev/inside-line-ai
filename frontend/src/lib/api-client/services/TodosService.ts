/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateTodoInput, IdResponse, TodoListResponse, TodoResponse, UpdateTodoInput, Uuid } from "@/types/schemas";
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TodosService {
    /**
     * @returns TodoListResponse List todos
     * @throws ApiError
     */
    public static getApiTodos(): CancelablePromise<TodoListResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/todos',
        });
    }
    /**
     * @param requestBody Create todo
     * @returns TodoResponse Created todo
     * @throws ApiError
     */
    public static postApiTodos(
        requestBody: CreateTodoInput,
    ): CancelablePromise<TodoResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/todos',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @returns TodoResponse Get todo
     * @throws ApiError
     */
    public static getApiTodos1(
        id: Uuid,
    ): CancelablePromise<TodoResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/todos/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Todo not found`,
            },
        });
    }
    /**
     * @param id
     * @param requestBody Update todo
     * @returns TodoResponse Updated todo
     * @throws ApiError
     */
    public static patchApiTodos(
        id: Uuid,
        requestBody: UpdateTodoInput,
    ): CancelablePromise<TodoResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/todos/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Todo not found`,
            },
        });
    }
    /**
     * @param id
     * @returns IdResponse Deleted todo
     * @throws ApiError
     */
    public static deleteApiTodos(
        id: Uuid,
    ): CancelablePromise<IdResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/todos/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Todo not found`,
            },
        });
    }
}
