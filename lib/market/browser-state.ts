// Browser storage is user-controlled and may contain an older schema.
export function favoriteIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        ),
      ]
    : [];
}

export function readFavorites(storage: Pick<Storage, "getItem">): string[] {
  try {
    return favoriteIds(JSON.parse(storage.getItem("mp-favorites") || "[]"));
  } catch {
    return [];
  }
}
