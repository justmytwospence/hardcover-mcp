export const USER_BOOK_STATUS = {
  WANT_TO_READ: 1,
  CURRENTLY_READING: 2,
  READ: 3,
  PAUSED: 4,
  DNF: 5,
  IGNORED: 6,
} as const;

export const USER_BOOK_STATUS_LABELS: Record<number, string> = {
  1: "Want to Read",
  2: "Currently Reading",
  3: "Read",
  4: "Paused",
  5: "Did Not Finish",
  6: "Ignored",
};

export const TAG_CATEGORY = {
  GENRE: 1,
  GENERAL: 2,
  CONTENT_WARNINGS: 3,
  MOOD: 4,
  PACE: 37,
} as const;

export const TAG_CATEGORY_LABELS: Record<number, string> = {
  1: "Genre",
  2: "General",
  3: "Content Warnings",
  4: "Mood",
  37: "Pace",
};

export const READING_FORMAT = {
  PHYSICAL: 1,
  AUDIO: 2,
  BOTH: 3,
  EBOOK: 4,
} as const;

export const PRIVACY_SETTING = {
  PUBLIC: 1,
  FOLLOWERS: 2,
  PRIVATE: 3,
} as const;

export const CONTRIBUTION_ROLES = [
  "Author",
  "Illustrator",
  "Translator",
  "Editor",
  "Narrator",
  "Foreword",
  "Afterword",
  "Cover Artist",
] as const;
