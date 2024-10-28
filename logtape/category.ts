export type CategoryList = readonly string[];

export type Category = string | readonly Category[];

export function getCategoryList(category: Category): CategoryList {
  return deepFlatten(category);
}

function deepFlatten(arr: Category): string[] {
  if (typeof arr === "string") return [arr];
  return arr.flatMap((item) => (
    typeof item === "string" ? [item] : deepFlatten(item)
  ));
}
