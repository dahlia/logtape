/**
 * A list of categories for a {@link LogRecord}
 */
export type CategoryList = Readonly<string[]>;

/**
 * A category as string or list of categories.
 */
export type Category = string | CategoryList;
