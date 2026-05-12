export function truncate(text: string, max = 300): string {
  if (!text) {
    return "";
  }

  return text.length > max ? `${text.slice(0, max)}...` : text;
}
