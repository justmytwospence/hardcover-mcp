import { z } from "zod";

export const paginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return (1-100, default 20)"),
  offset: z.number().int().min(0).default(0).describe("Number of results to skip for pagination"),
};

export interface PaginationMeta {
  total_count: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

export function computePagination(total: number, count: number, offset: number): PaginationMeta {
  const hasMore = total > offset + count;
  return {
    total_count: total,
    count,
    offset,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + count } : {}),
  };
}

export function formatPaginationNote(meta: PaginationMeta): string {
  if (!meta.has_more) return "";
  return `\n\n_Showing ${meta.offset + 1}-${meta.offset + meta.count} of ${meta.total_count}. Use offset: ${meta.next_offset} to see more._`;
}
