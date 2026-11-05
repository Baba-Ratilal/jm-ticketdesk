export function hashPassword(plain: string): Promise<string>;
export function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean>;
export function verifyErpSecret(plain: string, scheme: string | undefined, stored: string | null | undefined): boolean;
export function burnTime(plain: string): Promise<void>;
