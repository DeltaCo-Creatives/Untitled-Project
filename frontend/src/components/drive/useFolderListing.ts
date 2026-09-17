import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DriveFolder } from '../../lib/api';
import { errorMessage } from '../../lib/messages';
import { ROOT_FOLDER_ID } from './types';

const SEARCH_DEBOUNCE_MS = 300;
/**
 * Drive may return an empty page that still has a nextPageToken ("partial or empty result pages are
 * possible before the end"). Follow a few of those so a folder with children doesn't look empty.
 */
const EMPTY_PAGE_FOLLOWS = 4;

interface Listing {
  /** The request this data answers; anything else on screen is stale. */
  key: string;
  folders: DriveFolder[];
  nextPageToken: string | null;
  error: string | null;
}

interface MoreState {
  key: string;
  loading: boolean;
  error: string | null;
}

/** Stable while loading, so effects keyed on `folders` don't re-run every render. */
const NO_FOLDERS: DriveFolder[] = [];
const NOTHING_LOADED: Listing = { key: '', folders: NO_FOLDERS, nextPageToken: null, error: null };

export interface FolderListing {
  /** Folders for the current parent or search; empty while loading. */
  folders: DriveFolder[];
  /** True until the first page for the current parent/search arrives (including the search debounce). */
  loading: boolean;
  loadingMore: boolean;
  /** The first page failed; `reload()` tries again. */
  error: string | null;
  /** The last `loadMore()` failed; the folders already shown stay put. */
  loadMoreError: string | null;
  hasMore: boolean;
  /** A non-empty query searches all of Drive instead of listing the parent. */
  searching: boolean;
  loadMore: () => void;
  reload: () => void;
  /** Put a folder the user just created at the top of the current listing. */
  addFolder: (folder: DriveFolder) => void;
}

function mergeFolders(current: DriveFolder[], incoming: DriveFolder[]) {
  const seen = new Set(current.map((folder) => folder.id));
  return [...current, ...incoming.filter((folder) => !seen.has(folder.id))];
}

/** Just-created folders first, without repeating any the page already has. */
function withCreated(created: DriveFolder[], folders: DriveFolder[]) {
  if (created.length === 0) return folders;
  const ids = new Set(created.map((folder) => folder.id));
  return [...created, ...folders.filter((folder) => !ids.has(folder.id))];
}

/**
 * Loads one Drive folder's subfolders ('root' = My Drive), or searches every
 * folder by name when `query` isn't blank. Searches are debounced; responses
 * for a parent or query the user has already moved on from are dropped.
 */
export function useFolderListing({ parentId, query }: { parentId: string; query: string }): FolderListing {
  const q = query.trim();
  const parent = parentId || ROOT_FOLDER_ID;
  const [nonce, setNonce] = useState(0);
  const key = `${q ? `search:${q}` : `folder:${parent}`}#${nonce}`;

  const [listing, setListing] = useState<Listing>(NOTHING_LOADED);
  const [more, setMore] = useState<MoreState | null>(null);

  const loadedKey = useRef('');
  const previousQuery = useRef(q);
  const moreInFlight = useRef<string | null>(null);
  /** Folders created while their listing's first page was still on its way (that page may predate them). */
  const createdWhileLoading = useRef<{ key: string; folders: DriveFolder[] } | null>(null);

  useEffect(() => {
    const typed = q !== previousQuery.current;
    previousQuery.current = q;
    // Back on a request whose answer is still on screen (typed and undid a character).
    if (loadedKey.current === key) return;

    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        let next: Listing;
        try {
          let page = await api.listFolders(q ? { q } : { parentId: parent });
          for (let follows = 0; follows < EMPTY_PAGE_FOLLOWS && page.folders.length === 0 && page.nextPageToken; follows++) {
            if (cancelled) return;
            const pageToken = page.nextPageToken;
            page = await api.listFolders(q ? { q, pageToken } : { parentId: parent, pageToken });
          }
          next = { key, folders: page.folders, nextPageToken: page.nextPageToken, error: null };
        } catch (err) {
          next = { key, folders: [], nextPageToken: null, error: errorMessage(err, 'Couldn’t load your folders') };
        }
        if (cancelled) return;
        const created = createdWhileLoading.current;
        createdWhileLoading.current = null;
        if (created?.key === key) next = { ...next, folders: withCreated(created.folders, next.folders) };
        loadedKey.current = key;
        moreInFlight.current = null;
        setListing(next);
        setMore(null);
      },
      q && typed ? SEARCH_DEBOUNCE_MS : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, q, parent]);

  const current = listing.key === key;
  const nextPageToken = current && !listing.error ? listing.nextPageToken : null;
  const moreForThis = more && more.key === key ? more : null;

  const loadMore = useCallback(() => {
    if (!nextPageToken) return;
    const request = `${key}|${nextPageToken}`;
    if (moreInFlight.current === request) return;
    moreInFlight.current = request;
    setMore({ key, loading: true, error: null });

    api
      .listFolders(q ? { q, pageToken: nextPageToken } : { parentId: parent, pageToken: nextPageToken })
      .then(
        (page) => {
          if (moreInFlight.current !== request) return;
          moreInFlight.current = null;
          setListing((prev) =>
            prev.key === key
              ? { ...prev, folders: mergeFolders(prev.folders, page.folders), nextPageToken: page.nextPageToken }
              : prev,
          );
          setMore((prev) => (prev?.key === key ? { key, loading: false, error: null } : prev));
        },
        (err: unknown) => {
          if (moreInFlight.current !== request) return;
          moreInFlight.current = null;
          const message = errorMessage(err, 'Couldn’t load more folders');
          setMore((prev) => (prev?.key === key ? { key, loading: false, error: message } : prev));
        },
      );
  }, [key, q, parent, nextPageToken]);

  const reload = useCallback(() => {
    moreInFlight.current = null;
    setNonce((n) => n + 1);
  }, []);

  const addFolder = useCallback(
    (folder: DriveFolder) => {
      if (loadedKey.current !== key) {
        // The first page hasn't arrived yet and may not include it: add it when the page lands.
        const earlier = createdWhileLoading.current?.key === key ? createdWhileLoading.current.folders : [];
        createdWhileLoading.current = { key, folders: withCreated([folder], earlier) };
        return;
      }
      setListing((prev) => (prev.key === key ? { ...prev, folders: withCreated([folder], prev.folders) } : prev));
    },
    [key],
  );

  return {
    folders: current ? listing.folders : NO_FOLDERS,
    loading: !current,
    loadingMore: Boolean(moreForThis?.loading),
    error: current ? listing.error : null,
    loadMoreError: moreForThis?.error ?? null,
    hasMore: Boolean(nextPageToken),
    searching: q !== '',
    loadMore,
    reload,
    addFolder,
  };
}
