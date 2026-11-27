import 'server-only';
import { cache } from 'react';
import { loadContent } from './content';
// Request memoization keeps one revision per key throughout a server render.
// This is not persistent caching: the next document load fetches publication again.
export const publicContent = cache(loadContent);
