import { z } from 'zod';
import { DateTimeSchema, IdSchema, PlaceSchema, responseSchema } from '@ryadom/types';
import { pageSchema } from './common';

export const FavoriteSchema = z.strictObject({ placeId: IdSchema, savedAt: DateTimeSchema, place: PlaceSchema.nullable() });
export const FavoriteResponseSchema = responseSchema(FavoriteSchema);
export const FavoritesResponseSchema = responseSchema(pageSchema(FavoriteSchema));
export type Favorite = z.infer<typeof FavoriteSchema>;
