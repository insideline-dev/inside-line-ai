/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HealthService {
    /**
     * @returns any Ping the API
     * @throws ApiError
     */
    public static getApiPing(): CancelablePromise<{
        success: boolean;
        data: {
            message: string;
        };
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/ping',
        });
    }
}
