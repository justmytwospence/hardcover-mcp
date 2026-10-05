import { USER_BOOK_STATUS_LABELS, TAG_CATEGORY_LABELS } from "./types.js";

const CHARACTER_LIMIT = 25_000;

export function formatResult(
  data: unknown,
  markdown?: string
): {
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
} {
  const json = JSON.stringify(data, null, 2);
  const text = markdown ?? json;
  const truncated =
    text.length > CHARACTER_LIMIT
      ? text.slice(0, CHARACTER_LIMIT) + "\n\n_[Response truncated. Use limit/offset to paginate.]_"
      : text;

  return {
    content: [{ type: "text", text: truncated }],
  };
}

export function formatBook(book: Record<string, unknown>): string {
  if (!book) return "Book not found.";
  const lines: string[] = [];
  lines.push(`# ${book.title ?? "Unknown Title"}`);
  if (book.subtitle) lines.push(`*${book.subtitle}*`);
  lines.push("");

  const contributions = book.contributions as
    Array<{ author: { name: string; id: number } }> | undefined;
  if (contributions?.length) {
    const authors = contributions.map((c) => c.author.name).join(", ");
    lines.push(`**Author(s):** ${authors}`);
  }

  if (book.release_year) lines.push(`**Year:** ${book.release_year}`);
  if (book.pages) lines.push(`**Pages:** ${book.pages}`);
  if (book.rating) lines.push(`**Rating:** ${book.rating}/5`);
  if (book.ratings_count) lines.push(`**Ratings:** ${book.ratings_count}`);
  if (book.reviews_count) lines.push(`**Reviews:** ${book.reviews_count}`);
  if (book.users_read_count) lines.push(`**Readers:** ${book.users_read_count}`);
  lines.push("");

  if (book.description) {
    lines.push(`## Description`);
    lines.push(String(book.description));
    lines.push("");
  }

  const taggings = book.taggings as
    | Array<{
        tag: { tag: string; tag_category_id: number };
      }>
    | undefined;
  if (taggings?.length) {
    const grouped: Record<string, string[]> = {};
    for (const t of taggings) {
      const cat = TAG_CATEGORY_LABELS[t.tag.tag_category_id] ?? "Other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t.tag.tag);
    }
    for (const [cat, tags] of Object.entries(grouped)) {
      lines.push(`**${cat}:** ${tags.join(", ")}`);
    }
    lines.push("");
  }

  const bookSeries = book.book_series as
    Array<{ series: { id: number; name: string }; position: string }> | undefined;
  if (bookSeries?.length) {
    for (const bs of bookSeries) {
      lines.push(`**Series:** ${bs.series.name}${bs.position ? ` #${bs.position}` : ""}`);
    }
  }

  return lines.join("\n");
}

export function formatBookSummary(book: Record<string, unknown>): string {
  const contributions = book.contributions as Array<{ author: { name: string } }> | undefined;
  const author = contributions?.[0]?.author.name ?? "Unknown";
  const rating = book.rating ? ` (${book.rating}/5)` : "";
  return `- **${book.title}** by ${author}${rating} [ID: ${book.id}]`;
}

export function formatAuthor(author: Record<string, unknown>): string {
  if (!author) return "Author not found.";
  const lines: string[] = [];
  lines.push(`# ${author.name}`);
  lines.push("");
  if (author.books_count) lines.push(`**Books:** ${author.books_count}`);
  if (author.born_date) lines.push(`**Born:** ${author.born_date}`);
  if (author.death_date) lines.push(`**Died:** ${author.death_date}`);
  lines.push("");
  if (author.bio) {
    lines.push(String(author.bio));
    lines.push("");
  }
  return lines.join("\n");
}

export function formatSeries(series: Record<string, unknown>): string {
  if (!series) return "Series not found.";
  const lines: string[] = [];
  lines.push(`# ${series.name}`);
  lines.push("");
  if (series.books_count) lines.push(`**Books:** ${series.books_count}`);
  if (series.primary_books_count) lines.push(`**Primary Books:** ${series.primary_books_count}`);
  lines.push(`**Completed:** ${(series.is_completed as boolean) ? "Yes" : "No"}`);
  lines.push("");
  if (series.description) {
    lines.push(String(series.description));
    lines.push("");
  }

  const bookSeries = series.book_series as
    | Array<{
        position: string;
        book: { id: number; title: string; rating?: number };
      }>
    | undefined;
  if (bookSeries?.length) {
    lines.push("## Books");
    const sorted = [...bookSeries].sort(
      (a, b) => parseFloat(a.position || "0") - parseFloat(b.position || "0")
    );
    for (const bs of sorted) {
      const rating = bs.book.rating ? ` (${bs.book.rating}/5)` : "";
      lines.push(
        `${bs.position ? `#${bs.position}` : "-"} ${bs.book.title}${rating} [ID: ${bs.book.id}]`
      );
    }
  }

  return lines.join("\n");
}

export function formatUserBook(ub: Record<string, unknown>): string {
  const book = ub.book as Record<string, unknown> | undefined;
  const title = book?.title ?? "Unknown";
  const statusId = ub.status_id as number;
  const status = USER_BOOK_STATUS_LABELS[statusId] ?? "Unknown";
  const rating = ub.rating ? ` | Rating: ${ub.rating}/5` : "";
  const owned = ub.owned ? " | Owned" : "";
  return `- **${title}** — ${status}${rating}${owned} [ID: ${ub.id}]`;
}

export function formatList(list: Record<string, unknown>): string {
  if (!list) return "List not found.";
  const lines: string[] = [];
  lines.push(`# ${list.name}`);
  lines.push("");
  if (list.description) lines.push(String(list.description));
  if (list.books_count) lines.push(`**Books:** ${list.books_count}`);
  if (list.likes_count) lines.push(`**Likes:** ${list.likes_count}`);
  if (list.followers_count) lines.push(`**Followers:** ${list.followers_count}`);
  lines.push("");

  const listBooks = list.list_books as
    | Array<{
        position?: number;
        book: { id: number; title: string };
      }>
    | undefined;
  if (listBooks?.length) {
    lines.push("## Books");
    for (const lb of listBooks) {
      const pos = lb.position != null ? `${lb.position}. ` : "- ";
      lines.push(`${pos}${lb.book.title} [ID: ${lb.book.id}]`);
    }
  }

  return lines.join("\n");
}

export function formatEdition(edition: Record<string, unknown>): string {
  const parts: string[] = [];
  parts.push(`- **${edition.title ?? "Untitled"}**`);
  if (edition.isbn_13) parts.push(`ISBN-13: ${edition.isbn_13}`);
  else if (edition.isbn_10) parts.push(`ISBN-10: ${edition.isbn_10}`);
  if (edition.asin) parts.push(`ASIN: ${edition.asin}`);
  if (edition.pages) parts.push(`${edition.pages} pages`);
  if (edition.edition_format) parts.push(String(edition.edition_format));
  if (edition.publisher) {
    const pub = edition.publisher as Record<string, unknown>;
    parts.push(`Publisher: ${pub.name}`);
  }
  return parts.join(" | ");
}
