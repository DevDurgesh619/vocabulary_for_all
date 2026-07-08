// Bounds for student self-serve words-per-day. Kept in a plain module so both the
// "use server" action and client components can import them ("use server" files
// may only export async functions).
export const MIN_STUDENT_PACE = 50;
export const MAX_STUDENT_PACE = 500;
