/**
 * Trigger a client-side download of a CSV string. Used for the blank template
 * and for exporting the in-session config. Nothing is persisted in the browser
 * — the file goes straight to the user's filesystem (the source of truth).
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
