import { useEffect } from 'react';

/** Sets `document.title` to "`title` · DriveTag AI" for the life of the page. Mirrors LegalPage's own title effect. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · DriveTag AI`;
  }, [title]);
}
