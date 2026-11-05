export function isGuid(v: unknown): v is string;
export function query<T = any>(text: string, params?: Record<string, unknown>): Promise<T[]>;
export function closePool(): Promise<void>;
export function authMode(): string;
