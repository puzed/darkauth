import { z } from "zod/v4";

export const LIST_PAGE_MAX = 10000;
export const LIST_SEARCH_MAX_LENGTH = 128;

export const listPageQuerySchema = z.coerce.number().int().positive().max(LIST_PAGE_MAX);
export const listPageOpenApiQuerySchema = z.number().int().positive().max(LIST_PAGE_MAX).optional();
export const listSearchQuerySchema = z.string().max(LIST_SEARCH_MAX_LENGTH).optional();
