export const SOURCES:Record<string,string>;
export function acquire(key:string):Promise<{url:string;sha256:string;bytes:number}>;
