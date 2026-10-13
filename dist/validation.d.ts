export interface Schema {
    type?: 'object' | 'array' | 'string' | 'integer' | 'boolean';
    properties?: Record<string, Schema>;
    required?: string[];
    additionalProperties?: boolean;
    items?: Schema;
    enum?: unknown[];
    oneOf?: Schema[];
    minLength?: number;
    maxLength?: number;
    maxBytes?: number;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    minimum?: number;
    maximum?: number;
    default?: any;
    pattern?: string;
    format?: string;
    jsonLimit?: number;
    description?: string;
}
export declare const PROFILE_SCHEMA: Schema;
export declare const TOOL_SCHEMAS: Record<string, Schema>;
export declare const OWNER_SCHEMAS: Record<string, Schema>;
export declare function validateProfile(value: unknown): any;
export declare function validateInput(name: string, input: unknown, isOwner?: boolean): Record<string, any>;
/** Strip implementation-only extensions to produce a standard JSON Schema for the official SDK. */
export declare function publicSchema(schema: Schema): any;
