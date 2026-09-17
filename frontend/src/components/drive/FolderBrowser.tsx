import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  Check,
  ChevronRight,
  ChevronsDown,
  CircleAlert,
  Folder,
  FolderCheck,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  HardDrive,
  Inbox,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api, type DriveFolder } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { errorMessage } from '../../lib/messages';
import { plural } from '../../lib/format';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { TextField } from '../ui/TextField';
import { MY_DRIVE_NAME, ROOT_FOLDER_ID, SHARED_DRIVE_REASON, type DisabledFolders, type PickedFolder } from './types';
import { useFolderListing } from './useFolderListing';

interface Crumb {
  id: string;
  name: string;
  /** The path lookup failed and the real name was never known: `name` is only a stand-in. */
  unknownName?: boolean;
}

interface BrowseLocation {
  /** The folder being browsed; 'root' is My Drive. */
  id: string;
  /** Known when the user opened it from a list; null until its path resolves, and still null if that lookup failed. */
  name: string | null;
  /** Set for folders inside a shared drive. */
  driveId?: string;
  /** Folders below My Drive, down to and including this one. null while resolving. */
  trail: Crumb[] | null;
  /** False for folders only shared with the user: automatic sorting can't see them. */
  inMyDrive: boolean;
}

/** A created folder's row, or the first row a "Load more" page added. */
type PendingFocus = { rowId: string } | { rowIndex: number };

interface FolderBrowserProps {
  selectedId?: string | null;
  onSelect: (folder: PickedFolder) => void;
  disabledFolders?: DisabledFolders;
  /** Start inside this folder (breadcrumbs resolved with api.folderPath); default My Drive root. Read on mount. */
  startFolderId?: string | null;
  /** Show the inline "New folder" action (default true). */
  allowCreate?: boolean;
}

const ROOT_LOCATION: BrowseLocation = { id: ROOT_FOLDER_ID, name: MY_DRIVE_NAME, trail: [], inMyDrive: true };

const FOLDER_NAME_MAX = 100;
/** Longer trails show My Drive › … › the last two, until the user expands them. */
const COLLAPSE_TRAIL_AFTER = 3;
const SKELETON_ROWS = 5;

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60';

const UNKNOWN_FOLDER_NAME = 'This folder';
const UNKNOWN_FOLDER_REASON = 'Couldn’t look this folder up, so it can’t be picked. Try a folder inside it, or start from My Drive.';

function initialLocation(startFolderId?: string | null): BrowseLocation {
  if (!startFolderId || startFolderId === ROOT_FOLDER_ID) return ROOT_LOCATION;
  return { id: startFolderId, name: null, trail: null, inMyDrive: true };
}

function disabledReason(disabledFolders: DisabledFolders | undefined, id: string, driveId?: string) {
  if (disabledFolders && Object.hasOwn(disabledFolders, id)) {
    return disabledFolders[id] || 'This folder can’t be picked here';
  }
  return driveId ? SHARED_DRIVE_REASON : null;
}

interface FolderRowProps {
  folder: DriveFolder;
  /** Why it can't be picked, or null when it can. */
  reason: string | null;
  selected: boolean;
  /** Just created here: tinted and badged until the user moves on. */
  isNew: boolean;
  onOpen: () => void;
  onSelect: () => void;
}

function FolderRow({ folder, reason, selected, isNew, onOpen, onSelect }: FolderRowProps) {
  return (
    <li data-id={folder.id} className="folder-row">
      <div
        className={`group relative flex items-center gap-2 rounded-xl py-1.5 pl-2 pr-1 transition-colors sm:gap-3 sm:pl-2.5 ${
          selected
            ? 'bg-lavender-soft ring-2 ring-inset ring-lavender'
            : isNew
              ? 'bg-butter-soft'
              : 'hover:bg-lavender-soft/70'
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            selected ? 'bg-lavender' : isNew ? 'bg-butter' : reason ? 'bg-canvas' : 'bg-lavender-soft'
          }`}
        >
          {selected ? (
            <FolderCheck aria-hidden className="h-4 w-4" />
          ) : (
            <Folder aria-hidden className={`h-4 w-4 ${reason ? 'text-ink-soft' : ''}`} />
          )}
        </span>

        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`truncate text-sm font-bold ${reason ? 'text-ink-soft' : 'text-ink'}`}>{folder.name}</span>
            {isNew && (
              <span className="shrink-0 rounded-full bg-butter px-2 py-0.5 text-[11px] font-bold text-ink">New</span>
            )}
          </span>
          {reason && <span className="block text-xs leading-snug text-ink-soft">{reason}</span>}
        </span>

        {!reason && (
          <button
            type="button"
            onClick={onSelect}
            aria-label={selected ? `Selected: ${folder.name}` : `Select ${folder.name}`}
            className={`relative z-10 inline-flex shrink-0 items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${FOCUS_RING} ${
              selected
                ? 'border-transparent bg-lavender text-ink'
                : 'border-line bg-white text-ink hover:border-lavender hover:bg-lavender-soft'
            }`}
          >
            {selected && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
            {selected ? 'Selected' : 'Select'}
          </button>
        )}

        {/* Its ::after stretches over the whole row, so clicking anywhere on the row opens the folder. */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${folder.name}`}
          className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-soft transition-colors after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:bg-white hover:text-ink ${FOCUS_RING}`}
        >
          <ChevronRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </li>
  );
}

/**
 * Browse and search Google Drive folders, pick one, or make a new one.
 * Everything is folder metadata: no file contents ever reach the browser.
 */
export function FolderBrowser({ selectedId = null, onSelect, disabledFolders, startFolderId, allowCreate = true }: FolderBrowserProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const listId = useId();

  const [location, setLocation] = useState<BrowseLocation>(() => initialLocation(startFolderId));
  const [query, setQuery] = useState('');
  const [expandedTrail, setExpandedTrail] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  /** Where the last navigation went and which way, for the slide. */
  const travel = useRef<{ to: string; dir: 1 | -1 } | null>(null);
  /** The folder being browsed right now, for async work that finishes after the user moved on. */
  const browsingId = useRef(location.id);
  /** Rows that have already animated in for the listing on screen. */
  const shownRows = useRef(new Set<string>());
  /** Where keyboard focus should land once rows it was waiting on render. */
  const pendingFocus = useRef<PendingFocus | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newFolderButtonRef = useRef<HTMLButtonElement>(null);

  const { folders, loading, loadingMore, error, loadMoreError, hasMore, searching, loadMore, reload, addFolder } =
    useFolderListing({ parentId: location.id, query });

  const trimmedQuery = query.trim();
  const trail = location.trail;
  const atRoot = location.id === ROOT_FOLDER_ID || (trail !== null && trail.length === 0);
  const currentName = atRoot ? MY_DRIVE_NAME : (location.name ?? trail?.at(-1)?.name ?? null);
  // Resolved but still nameless: picking it would save a made-up name for a folder we may not be able to reach.
  const nameUnknown = !atRoot && trail !== null && location.name === null;
  const currentReason = atRoot
    ? null
    : (disabledReason(disabledFolders, location.id, location.driveId) ?? (nameUnknown ? UNKNOWN_FOLDER_REASON : null));
  const currentSelected = !atRoot && selectedId === location.id;
  const canCreate = allowCreate && !searching && !location.driveId;

  // Folders opened from search results or passed in as startFolderId need their breadcrumbs looked up.
  useEffect(() => {
    if (location.trail !== null) return;
    const id = location.id;
    let cancelled = false;

    api.folderPath(id).then(
      ({ path, inMyDrive }) => {
        if (cancelled) return;
        // path[0] is My Drive itself when the folder lives there; the root crumb is always drawn separately.
        const below = inMyDrive ? path.slice(1) : path;
        setLocation((prev) =>
          prev.id === id && prev.trail === null
            ? {
                ...prev,
                trail: below,
                name: below.at(-1)?.name ?? (inMyDrive ? MY_DRIVE_NAME : prev.name),
                inMyDrive,
              }
            : prev,
        );
      },
      () => {
        if (cancelled) return;
        // The listing reports real access problems; keep the breadcrumbs usable anyway.
        setLocation((prev) =>
          prev.id === id && prev.trail === null
            ? { ...prev, trail: [{ id, name: prev.name ?? UNKNOWN_FOLDER_NAME, unknownName: prev.name === null }] }
            : prev,
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [location.id, location.trail]);

  // ---------------------------------------------------------------- navigation

  const moveTo = (next: BrowseLocation, dir: 1 | -1) => {
    const scroller = scrollerRef.current;
    // The clicked row or crumb is about to disappear; keep keyboard focus in the browser instead of dropping it.
    const active = document.activeElement;
    if (scroller && active instanceof HTMLButtonElement && rootRef.current?.contains(active)) {
      scroller.focus({ preventScroll: true });
    }
    if (scroller) scroller.scrollTop = 0;
    travel.current = { to: next.id, dir };
    browsingId.current = next.id;
    pendingFocus.current = null;
    setLocation(next);
    setExpandedTrail(false);
    setCreating(false);
    setNewName('');
    setCreateError(null);
    setHighlightId(null);
    setAnnouncement('');
  };

  const openFolder = (folder: DriveFolder) => {
    if (searching) {
      // Search results come from anywhere in Drive, so their path has to be looked up.
      setQuery('');
      moveTo({ id: folder.id, name: folder.name, driveId: folder.driveId, trail: null, inMyDrive: true }, 1);
      return;
    }
    moveTo(
      {
        id: folder.id,
        name: folder.name,
        driveId: folder.driveId ?? location.driveId,
        trail: trail ? [...trail, { id: folder.id, name: folder.name }] : null,
        inMyDrive: location.inMyDrive,
      },
      1,
    );
  };

  const goToCrumb = (index: number) => {
    if (index < 0) {
      moveTo(ROOT_LOCATION, -1);
      return;
    }
    if (!trail || !trail[index]) return;
    const crumb = trail[index];
    moveTo(
      {
        id: crumb.id,
        name: crumb.unknownName ? null : crumb.name,
        driveId: location.driveId,
        trail: trail.slice(0, index + 1),
        inMyDrive: location.inMyDrive,
      },
      -1,
    );
  };

  const selectFolder = (folder: PickedFolder) => onSelect({ id: folder.id, name: folder.name });

  // ---------------------------------------------------------------- search

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Results already load as you type; don't submit a surrounding form.
      event.preventDefault();
    } else if (event.key === 'Escape' && query) {
      // First Escape clears the search instead of closing a surrounding dialog.
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  };

  const clearSearch = () => {
    setQuery('');
    searchRef.current?.focus();
  };

  const expandTrail = (event: MouseEvent<HTMLButtonElement>) => {
    const nav = event.currentTarget.closest('nav');
    // Render the full path now so focus can move to the first crumb the "…" was hiding.
    flushSync(() => setExpandedTrail(true));
    nav?.querySelector<HTMLButtonElement>('[data-crumb-index="0"]')?.focus();
  };

  // ---------------------------------------------------------------- new folder

  const toggleCreate = () => {
    setCreating((open) => !open);
    setNewName('');
    setCreateError(null);
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName('');
    setCreateError(null);
    newFolderButtonRef.current?.focus();
  };

  const createFolder = async () => {
    if (createBusy) return;
    const name = newName.trim();
    if (!name) {
      setCreateError('Give your new folder a name.');
      return;
    }
    if (name.length > FOLDER_NAME_MAX) {
      setCreateError(`Folder names can be up to ${FOLDER_NAME_MAX} characters.`);
      return;
    }

    const parentId = location.id;
    const parentName = currentName ?? 'the folder you left';
    setCreateBusy(true);
    setCreateError(null);
    try {
      const { folder } = await api.createFolder(name, parentId);
      if (browsingId.current !== parentId) {
        // The user browsed elsewhere meanwhile: leave that folder's list and form alone.
        setAnnouncement(`Created “${folder.name}” in ${parentName}.`);
        return;
      }
      pendingFocus.current = { rowId: folder.id };
      addFolder(folder);
      setHighlightId(folder.id);
      setCreating(false);
      setNewName('');
      setAnnouncement(`Created “${folder.name}”. Select it if it’s the one you want.`);
      if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    } catch (err) {
      if (browsingId.current !== parentId) return;
      setCreateError(errorMessage(err, 'Couldn’t create that folder'));
      newNameRef.current?.focus();
    } finally {
      setCreateBusy(false);
    }
  };

  const onNewNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void createFolder();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelCreate();
    }
  };

  const retryListing = () => {
    // The Try again button is replaced by skeleton rows; keep focus in the browser.
    scrollerRef.current?.focus({ preventScroll: true });
    reload();
  };

  const onLoadMore = () => {
    if (loadingMore) return;
    pendingFocus.current = { rowIndex: folders.length };
    loadMore();
  };

  // ---------------------------------------------------------------- focus

  // Focus the name box when the New folder form opens.
  useEffect(() => {
    if (creating) newNameRef.current?.focus();
  }, [creating]);

  // A created folder or the end of the list replaced the focused control: move focus to the rows that arrived.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || loading || folders.length === 0) return;
    pendingFocus.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('.folder-row') ?? []);
    const row = 'rowId' in target ? rows.find((item) => item.dataset.id === target.rowId) : rows[target.rowIndex];
    row?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [folders, loading]);

  // ---------------------------------------------------------------- motion

  // The list slides in from the direction of travel: deeper from the right, up from the left.
  useGSAP(
    () => {
      const move = travel.current;
      const scroller = scrollerRef.current;
      if (!move || move.to !== location.id || !scroller) return;
      const crumb = gsap.utils.toArray<HTMLElement>('.crumb-current', rootRef.current);
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        // opacity, not autoAlpha: visibility:hidden would steal focus from the list.
        gsap.fromTo(scroller, { x: 40 * move.dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
        if (crumb.length > 0) {
          gsap.from(crumb, { x: 12 * move.dir, autoAlpha: 0, duration: 0.4, ease: 'power2.out' });
        }
      });
      return () => mm.revert();
    },
    { dependencies: [location.id], scope: rootRef, revertOnUpdate: true },
  );

  // Rows stagger in once per listing; "Load more" only animates the new page; a created folder pops.
  // Rows and the form fade with opacity rather than autoAlpha so they can take focus mid-animation.
  useGSAP(
    () => {
      if (loading) {
        shownRows.current.clear();
        return;
      }
      const rows = gsap.utils
        .toArray<HTMLElement>('.folder-row', rootRef.current)
        .filter((row) => !shownRows.current.has(row.dataset.id ?? ''));
      if (rows.length === 0) return;
      rows.forEach((row) => shownRows.current.add(row.dataset.id ?? ''));

      const popped = rows.filter((row) => row.dataset.id === highlightId);
      const staggered = rows.filter((row) => row.dataset.id !== highlightId);
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (staggered.length > 0) {
          gsap.from(staggered, {
            y: 14,
            opacity: 0,
            duration: 0.4,
            stagger: Math.min(0.035, 0.7 / staggered.length),
            ease: 'power2.out',
          });
        }
        if (popped.length > 0) {
          gsap.from(popped, { scale: 0.6, opacity: 0, duration: 0.8, ease: 'elastic.out(1, 0.55)' });
        }
      });
      return () => mm.revert();
    },
    { dependencies: [folders, loading, highlightId], scope: rootRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const form = gsap.utils.toArray<HTMLElement>('.new-folder-form', rootRef.current);
      if (!creating || form.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(form, { y: -10, scale: 0.97, opacity: 0, duration: 0.45, ease: 'back.out(2)' });
      });
      return () => mm.revert();
    },
    { dependencies: [creating], scope: rootRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const form = gsap.utils.toArray<HTMLElement>('.new-folder-form', rootRef.current);
      if (!createError || form.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(form, { keyframes: { x: [0, -8, 7, -4, 0] }, duration: 0.45 });
      });
      return () => mm.revert();
    },
    { dependencies: [createError], scope: rootRef, revertOnUpdate: true },
  );

  // ---------------------------------------------------------------- render

  const collapsed = trail !== null && trail.length > COLLAPSE_TRAIL_AFTER && !expandedTrail;
  const shownTrail = trail
    ? trail.map((crumb, index) => ({ crumb, index })).filter(({ index }) => !collapsed || index >= trail.length - 2)
    : [];

  const listLabel = searching ? `Folders matching “${trimmedQuery}”` : `Folders in ${currentName ?? 'this folder'}`;
  const listStatus = loading
    ? searching
      ? 'Searching your Drive…'
      : 'Loading folders…'
    : error
      ? 'Couldn’t load folders.'
      : searching
        ? `${plural(folders.length, 'folder matches', 'folders match')} “${trimmedQuery}”.`
        : `${plural(folders.length, 'folder', 'folders')} in ${currentName ?? 'this folder'}.`;

  const crumbButton = `inline-flex min-w-0 max-w-[9rem] items-center gap-1.5 rounded-lg px-2 py-1 font-bold text-ink-soft transition-colors hover:bg-lavender-soft hover:text-ink sm:max-w-[12rem] ${FOCUS_RING}`;

  const separator = <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-soft" />;

  return (
    <div ref={rootRef} className="min-w-0 space-y-3">
      {/* Search */}
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search all of your Drive’s folders
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          ref={searchRef}
          id={searchId}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search all your folders…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-controls={listId}
          className="w-full rounded-2xl border border-line bg-canvas py-3 pl-11 pr-11 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink-soft focus:border-lavender focus:outline-none focus:ring-4 focus:ring-lavender/40"
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-lavender-soft hover:text-ink ${FOCUS_RING}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Where you are + New folder */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {searching ? (
          <p className="flex min-w-0 items-center gap-2 px-1 text-sm font-semibold text-ink-soft">
            <FolderSearch aria-hidden className="h-4 w-4 shrink-0 text-lavender-deep" />
            Searching all of your Drive
          </p>
        ) : (
          <nav aria-label="Folder path" className="min-w-0 flex-1">
            <ol className="flex flex-wrap items-center gap-0.5 text-sm">
              <li className="flex min-w-0 items-center">
                {atRoot ? (
                  <span aria-current="location" className="crumb-current inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-bold text-ink">
                    <HardDrive aria-hidden className="h-4 w-4 shrink-0" />
                    {MY_DRIVE_NAME}
                  </span>
                ) : (
                  <button type="button" onClick={() => goToCrumb(-1)} className={crumbButton}>
                    <HardDrive aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="truncate">{MY_DRIVE_NAME}</span>
                  </button>
                )}
              </li>

              {!atRoot && !location.inMyDrive && (
                <li className="flex items-center gap-0.5">
                  {separator}
                  <span className="rounded-full bg-periwinkle-soft px-2.5 py-0.5 text-xs font-bold text-ink">Shared with you</span>
                </li>
              )}

              {trail === null && !atRoot && (
                <li className="flex items-center gap-0.5">
                  {separator}
                  <Skeleton className="h-6 w-24" />
                  <span className="sr-only">Finding this folder’s path…</span>
                </li>
              )}

              {collapsed && trail && (
                <li className="flex items-center gap-0.5">
                  {separator}
                  <button
                    type="button"
                    onClick={expandTrail}
                    aria-label={`Show ${plural(trail.length - 2, 'hidden folder', 'hidden folders')} in the path`}
                    className={`rounded-lg px-2 py-1 font-bold text-ink-soft transition-colors hover:bg-lavender-soft hover:text-ink ${FOCUS_RING}`}
                  >
                    …
                  </button>
                </li>
              )}

              {shownTrail.map(({ crumb, index }) => {
                const isCurrent = index === (trail?.length ?? 0) - 1;
                return (
                  <li key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                    {separator}
                    {isCurrent ? (
                      <span
                        aria-current="location"
                        title={crumb.name}
                        className="crumb-current min-w-0 max-w-[10rem] truncate rounded-lg px-2 py-1 font-bold text-ink sm:max-w-[14rem]"
                      >
                        {crumb.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => goToCrumb(index)}
                        title={crumb.name}
                        data-crumb-index={index}
                        className={crumbButton}
                      >
                        <span className="truncate">{crumb.name}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {canCreate && (
          <Button
            ref={newFolderButtonRef}
            variant="ghost"
            size="sm"
            onClick={toggleCreate}
            aria-expanded={creating}
            className="shrink-0"
          >
            <FolderPlus aria-hidden className="h-4 w-4" /> New folder
          </Button>
        )}
      </div>

      {!searching && !atRoot && !location.inMyDrive && (
        <p className="flex items-start gap-2 rounded-2xl bg-periwinkle-soft px-3.5 py-2.5 text-xs leading-relaxed text-ink">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Folders shared with you can only be organized with <strong>Organize now</strong>, not automatically.
          </span>
        </p>
      )}

      {/* The folder you're inside can be picked too */}
      {!searching && !atRoot && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-canvas px-3 py-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${currentSelected ? 'bg-lavender' : 'bg-lavender-soft'}`}
          >
            {currentSelected ? (
              <FolderCheck aria-hidden className="h-4 w-4" />
            ) : (
              <FolderOpen aria-hidden className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 grow basis-40">
            <p className="text-xs font-semibold text-ink-soft">You’re inside</p>
            {currentName ? (
              <p className="truncate text-sm font-bold" title={currentName}>
                {currentName}
              </p>
            ) : (
              <Skeleton className="mt-1 h-4 w-28" />
            )}
            {currentReason && <p className="mt-0.5 text-xs leading-snug text-ink-soft">{currentReason}</p>}
          </div>
          {!currentReason && (
            <Button
              size="sm"
              variant={currentSelected ? 'secondary' : 'primary'}
              disabled={!currentName}
              onClick={() => currentName && selectFolder({ id: location.id, name: currentName })}
              aria-label={currentName ? `${currentSelected ? 'Selected' : 'Use this folder'}: ${currentName}` : undefined}
              className="w-full shrink-0 sm:w-auto"
            >
              {currentSelected ? (
                <>
                  <Check aria-hidden className="h-4 w-4" strokeWidth={3} /> Selected
                </>
              ) : (
                'Use this folder'
              )}
            </Button>
          )}
        </div>
      )}

      {creating && canCreate && (
        <div className="new-folder-form rounded-2xl border border-dashed border-lavender bg-white p-3">
          <p className="mb-2 flex min-w-0 items-center gap-1.5 text-xs font-bold text-ink-soft">
            <FolderPlus aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              New folder in <span className="text-ink">{currentName ?? 'this folder'}</span>
            </span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <TextField
                label="New folder name"
                hideLabel
                value={newName}
                onChange={(event) => {
                  setNewName(event.currentTarget.value);
                  if (createError) setCreateError(null);
                }}
                onKeyDown={onNewNameKeyDown}
                placeholder="e.g. Client photos"
                error={createError}
                maxLength={FOLDER_NAME_MAX + 20}
                autoComplete="off"
                readOnly={createBusy}
                ref={newNameRef}
              />
            </div>
            <div className="flex shrink-0 gap-2 sm:pt-[3px]">
              <Button onClick={() => void createFolder()} disabled={createBusy} className="flex-1 sm:flex-none">
                {createBusy ? (
                  <>
                    <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <Check aria-hidden className="h-4 w-4" strokeWidth={3} /> Create
                  </>
                )}
              </Button>
              <Button variant="ghost" onClick={cancelCreate} disabled={createBusy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* The listing */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div
          ref={scrollerRef}
          id={listId}
          tabIndex={-1}
          aria-busy={loading}
          className="max-h-80 overflow-y-auto overscroll-contain p-1.5 focus:outline-none"
        >
          {loading ? (
            <div className="space-y-1.5 p-0.5">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft">
                <CircleAlert aria-hidden className="h-6 w-6 text-rose-ink" />
              </span>
              <p className="max-w-sm text-sm font-semibold text-rose-ink">{error}</p>
              <Button variant="secondary" size="sm" onClick={retryListing}>
                <RefreshCw aria-hidden className="h-4 w-4" /> Try again
              </Button>
            </div>
          ) : folders.length === 0 && !hasMore ? (
            <div className="flex flex-col items-center gap-2 px-4 py-9 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-soft">
                <Inbox aria-hidden className="h-6 w-6 text-lavender-deep" />
              </span>
              <p className="text-sm font-bold text-ink">
                {searching ? `No folders match “${trimmedQuery}”` : 'No folders here yet'}
              </p>
              <p className="max-w-xs text-xs leading-relaxed text-ink-soft">
                {searching
                  ? 'Check the spelling, or browse from My Drive instead.'
                  : canCreate && !atRoot && !currentReason
                    ? 'Make one with New folder, or use this folder itself.'
                    : canCreate
                      ? 'Make one with New folder.'
                      : !atRoot && !currentReason
                        ? 'You can still use this folder itself.'
                        : 'There’s nothing to open in here.'}
              </p>
            </div>
          ) : (
            <>
              {/* Drive can send empty pages that still have more after them: then only "Load more" shows. */}
              {folders.length > 0 && (
                <ul aria-label={listLabel} className="space-y-1">
                  {folders.map((folder) => (
                    <FolderRow
                      key={folder.id}
                      folder={folder}
                      reason={disabledReason(disabledFolders, folder.id, folder.driveId)}
                      selected={selectedId === folder.id}
                      isNew={highlightId === folder.id}
                      onOpen={() => openFolder(folder)}
                      onSelect={() => selectFolder({ id: folder.id, name: folder.name })}
                    />
                  ))}
                </ul>
              )}

              {hasMore && (
                <div className="px-1 pb-1 pt-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onLoadMore}
                    aria-disabled={loadingMore}
                    className="w-full aria-disabled:cursor-wait aria-disabled:opacity-60"
                  >
                    {loadingMore ? (
                      <>
                        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> Loading more…
                      </>
                    ) : loadMoreError ? (
                      <>
                        <RefreshCw aria-hidden className="h-4 w-4" /> Try loading more again
                      </>
                    ) : (
                      <>
                        <ChevronsDown aria-hidden className="h-4 w-4" /> Load more folders
                      </>
                    )}
                  </Button>
                  {loadMoreError && (
                    <p role="alert" className="mt-1 text-center text-xs font-semibold text-rose-ink">
                      {loadMoreError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {listStatus}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
