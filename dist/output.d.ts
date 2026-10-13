type Check = (value: any) => boolean;
export declare const OUTPUT_CHECKS: Record<string, Check>;
export declare function validateToolOutput(name: string, value: unknown): void;
export {};
