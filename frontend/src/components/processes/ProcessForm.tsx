import { useEffect, useRef, type ReactNode } from 'react';
import { MessageSquareText, Plus, Settings2, Shapes, Signpost, Sparkles, Tags, Type } from 'lucide-react';
import type { ProcessLimits, WorkProcess } from '../../lib/api';
import type { ProcessKind } from '../../lib/filename';
import { Flip, gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { FolderPickerField } from '../drive/FolderPickerField';
import { DestinationEditorCard } from './DestinationEditorCard';
import { InstructionsField } from './InstructionsField';
import { NamingTemplateEditor } from './NamingTemplateEditor';
import { ProcessKindBadge, ProcessKindPicker } from './ProcessKindPicker';
import { TagFieldsEditor } from './TagFieldsEditor';
import {
  DEFAULT_TEMPLATE_BY_KIND,
  DESTINATION_IDEAS_BY_KIND,
  QUICK_DESTINATION_LIMIT,
  UNSORTED_NAME,
  disabledFoldersFor,
  newDestinationDraft,
  syncTemplateWithTagFields,
  type DestinationDraft,
  type ProcessDraft,
  type TagFieldDraft,
} from './processDraft';

type Variant = 'full' | 'quick';

interface ProcessFormProps {
  /** 'quick' (onboarding) shows only the basics and destinations. */
  variant?: Variant;
  draft: ProcessDraft;
  onChange: (draft: ProcessDraft) => void;
  /** Keyed by server field path, e.g. "name" or "destinations[2].folder". */
  errors: Record<string, string>;
  limits: ProcessLimits;
  /** The user's other processes, for folder conflicts. */
  otherProcesses: WorkProcess[];
  disabled?: boolean;
}

type PendingFocus = { kind: 'name' | 'up' | 'down'; localId: string } | { kind: 'add' };

interface SectionProps {
  id: string;
  variant: Variant;
  icon: ReactNode;
  tint: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}

function Section({ id, variant, icon, tint, title, description, children }: SectionProps) {
  const full = variant === 'full';
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`process-section min-w-0 scroll-mt-24 ${full ? 'rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8' : ''}`}
    >
      <div className="mb-6 flex items-start gap-3 sm:gap-4">
        <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tint}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-heading`} tabIndex={-1} className={`${full ? 'text-2xl' : 'text-xl'} font-bold focus:outline-none`}>
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Every setting of a work process, in anchor-linked sections. Stateless: the parent owns the draft. */
export function ProcessForm({
  variant = 'full',
  draft,
  onChange,
  errors,
  limits,
  otherProcesses,
  disabled = false,
}: ProcessFormProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);
  const removing = useRef(new Set<string>());
  // A removal commits after its fade-out, by which time the draft may have moved on.
  const latest = useRef({ draft, onChange });

  useEffect(() => {
    latest.current = { draft, onChange };
  });

  const existing = draft.destinations.some((destination) => destination.id !== null);
  // Before a new process has a kind, the form still needs to render something; fall back to images.
  const kind: ProcessKind = draft.kind ?? 'image';
  const noun = kind === 'document' ? 'document' : 'image';
  const nouns = kind === 'document' ? 'documents' : 'images';

  const indexed = draft.destinations.map((destination, index) => ({ destination, index }));
  const regular = indexed.filter((entry) => !entry.destination.isFallback);
  const fallbacks = indexed.filter((entry) => entry.destination.isFallback);
  const maxRegular = variant === 'quick' ? Math.min(QUICK_DESTINATION_LIMIT, limits.maxDestinations) : limits.maxDestinations;
  const atLimit = regular.length >= maxRegular;
  const orderKey = draft.destinations.map((destination) => destination.localId).join('|');
  const usedNames = new Set(draft.destinations.map((destination) => destination.name.trim().toLowerCase()));
  const ideas = DESTINATION_IDEAS_BY_KIND[kind].filter((idea) => !usedNames.has(idea.name.toLowerCase()));
  const destinationFolders = disabledFoldersFor(otherProcesses, 'destination', draft);

  // ---------------------------------------------------------------- destination list motion

  const captureFlip = () => {
    const list = listRef.current;
    if (!list || prefersReducedMotion()) return;
    flipState.current = Flip.getState(list.querySelectorAll('[data-flip-card]'));
  };

  const { contextSafe } = useGSAP(
    () => {
      const list = listRef.current;
      if (!list) return;

      const state = flipState.current;
      flipState.current = null;
      if (state) {
        Flip.from(state, {
          targets: list.querySelectorAll('[data-flip-card]'),
          duration: 0.5,
          ease: 'power3.inOut',
          scale: true,
          // opacity, not autoAlpha: visibility:hidden would make the new card's name field unfocusable
          // at the exact moment we focus it below (onEnter runs synchronously inside Flip.from).
          onEnter: (elements) =>
            gsap.fromTo(
              elements,
              { opacity: 0, y: 18, scale: 0.97 },
              { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)' },
            ),
        });
      }

      const focus = pendingFocus.current;
      pendingFocus.current = null;
      if (!focus) return;
      if (focus.kind === 'add') {
        addButtonRef.current?.focus({ preventScroll: true });
        return;
      }
      const card = list.querySelector<HTMLElement>(`[data-destination-id="${focus.localId}"]`);
      if (!card) return;
      if (focus.kind === 'name') {
        card.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        card.querySelector('input')?.focus({ preventScroll: true });
        return;
      }
      // Keep keyboard focus on the moved card, even when it just reached the top or bottom.
      const same = card.querySelector<HTMLButtonElement>(`[data-move="${focus.kind}"]`);
      const opposite = card.querySelector<HTMLButtonElement>(`[data-move="${focus.kind === 'up' ? 'down' : 'up'}"]`);
      (same && !same.disabled ? same : opposite)?.focus({ preventScroll: true });
    },
    { dependencies: [orderKey], scope: listRef },
  );

  // ---------------------------------------------------------------- changes

  const update = (patch: Partial<ProcessDraft>) => onChange({ ...draft, ...patch });

  const withFallbackLast = (regularDrafts: DestinationDraft[], source: DestinationDraft[]) => [
    ...regularDrafts,
    ...source.filter((destination) => destination.isFallback),
  ];

  const updateDestination = (localId: string, patch: Partial<DestinationDraft>) =>
    update({
      destinations: draft.destinations.map((destination) =>
        destination.localId === localId ? { ...destination, ...patch } : destination,
      ),
    });

  const addDestination = (values?: { name: string; description: string }) => {
    if (atLimit || disabled) return;
    const created = newDestinationDraft(values);
    captureFlip();
    pendingFocus.current = { kind: 'name', localId: created.localId };
    update({
      destinations: withFallbackLast(
        [...draft.destinations.filter((destination) => !destination.isFallback), created],
        draft.destinations,
      ),
    });
  };

  const moveDestination = (localId: string, direction: -1 | 1) => {
    const regularDrafts = draft.destinations.filter((destination) => !destination.isFallback);
    const from = regularDrafts.findIndex((destination) => destination.localId === localId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= regularDrafts.length) return;
    [regularDrafts[from], regularDrafts[to]] = [regularDrafts[to], regularDrafts[from]];
    captureFlip();
    pendingFocus.current = { kind: direction < 0 ? 'up' : 'down', localId };
    update({ destinations: withFallbackLast(regularDrafts, draft.destinations) });
  };

  const fadeOut = contextSafe((element: Element, onComplete: () => void) => {
    gsap.to(element, { autoAlpha: 0, scale: 0.96, duration: 0.22, ease: 'power2.in', onComplete });
  });

  const removeDestination = (localId: string) => {
    if (removing.current.has(localId)) return;
    const commit = () => {
      removing.current.delete(localId);
      const { draft: current, onChange: emit } = latest.current;
      if (!current.destinations.some((destination) => destination.localId === localId)) return;
      captureFlip();
      pendingFocus.current = { kind: 'add' };
      emit({ ...current, destinations: current.destinations.filter((destination) => destination.localId !== localId) });
    };
    const card = listRef.current?.querySelector(`[data-destination-id="${localId}"]`);
    if (!card || prefersReducedMotion()) {
      commit();
      return;
    }
    removing.current.add(localId);
    fadeOut(card, commit);
  };

  const changeTagFields = (next: TagFieldDraft[]) =>
    update({ tagFields: next, renameTemplate: syncTemplateWithTagFields(draft.renameTemplate, draft.tagFields, next) });

  // Swaps in the new kind's default naming template, but only while the template is still untouched —
  // an edit the user made on purpose is never silently overwritten by switching kinds.
  const changeKind = (nextKind: ProcessKind) => {
    const untouched = draft.renameTemplate === DEFAULT_TEMPLATE_BY_KIND[kind];
    update({ kind: nextKind, renameTemplate: untouched ? DEFAULT_TEMPLATE_BY_KIND[nextKind] : draft.renameTemplate });
  };

  // ---------------------------------------------------------------- render

  const countText = atLimit
    ? variant === 'quick'
      ? 'Plenty to start. Add more later.'
      : `${regular.length} of ${maxRegular}: that’s the most a process can have`
    : `${regular.length} of ${maxRegular}`;

  const destinationCard = ({ destination, index }: { destination: DestinationDraft; index: number }, position: number) => (
    <DestinationEditorCard
      key={destination.localId}
      destination={destination}
      index={index}
      number={position + 1}
      kind={kind}
      errors={errors}
      limits={limits}
      masterName={draft.master?.name ?? null}
      masterFolderId={draft.master?.id ?? null}
      disabledFolders={destinationFolders}
      disabled={disabled}
      canMoveUp={!destination.isFallback && position > 0}
      canMoveDown={!destination.isFallback && position < regular.length - 1}
      onChange={(patch) => updateDestination(destination.localId, patch)}
      onRemove={destination.isFallback ? undefined : () => removeDestination(destination.localId)}
      onMove={destination.isFallback ? undefined : (direction) => moveDestination(destination.localId, direction)}
    />
  );

  return (
    <div className={variant === 'full' ? 'space-y-6' : 'space-y-10'}>
      {existing ? (
        <Section
          id="kind"
          variant={variant}
          icon={<Shapes className="h-5 w-5" />}
          tint="bg-periwinkle-soft"
          title="What this process sorts"
          description="Chosen when the process was created."
        >
          <div data-field="kind" data-invalid={errors.kind ? 'true' : undefined}>
            <ProcessKindBadge kind={kind} />
            {errors.kind && (
              <p role="alert" className="mt-2 text-xs font-semibold text-rose-ink">
                {errors.kind}
              </p>
            )}
          </div>
        </Section>
      ) : (
        <Section
          id="kind"
          variant={variant}
          icon={<Shapes className="h-5 w-5" />}
          tint="bg-periwinkle-soft"
          title="What this process sorts"
          description="Choose once — a process can’t switch kinds after it’s created."
        >
          <ProcessKindPicker value={draft.kind} onChange={changeKind} name="process-kind" error={errors.kind} disabled={disabled} />
        </Section>
      )}

      <Section
        id="basics"
        variant={variant}
        icon={<Settings2 className="h-5 w-5" />}
        tint="bg-lavender-soft"
        title="The basics"
        description={`Name the process, then pick where ${nouns} arrive and where sorted ones should live.`}
      >
        <div className="space-y-5">
          <div data-field="name" data-invalid={errors.name ? 'true' : undefined}>
            <TextField
              label="Process name"
              value={draft.name}
              onChange={(event) => update({ name: event.currentTarget.value })}
              placeholder="e.g. Acme product shoots"
              maxChars={limits.nameMax}
              error={errors.name}
              hint="Just for you. It also fills the {process} token in file names."
              disabled={disabled}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div data-field="rawFolderId" data-invalid={errors.rawFolderId ? 'true' : undefined} className="min-w-0">
              <FolderPickerField
                label="Raw folder"
                tone="butter"
                value={draft.raw}
                onChange={(raw) => update({ raw })}
                hint={`Drop ${nouns} here and DriveTag sorts them.`}
                error={errors.rawFolderId}
                disabledFolders={disabledFoldersFor(otherProcesses, 'raw', draft)}
                modalTitle="Choose the Raw folder"
                disabled={disabled}
              />
            </div>
            <div data-field="masterFolderId" data-invalid={errors.masterFolderId ? 'true' : undefined} className="min-w-0">
              <FolderPickerField
                label="Master folder"
                tone="sage"
                value={draft.master}
                onChange={(master) => update({ master })}
                hint={`Sorted ${nouns} go into folders inside this one`}
                error={errors.masterFolderId}
                disabledFolders={disabledFoldersFor(otherProcesses, 'master', draft)}
                modalTitle="Choose the Master folder"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="destinations"
        variant={variant}
        icon={<Signpost className="h-5 w-5" />}
        tint="bg-periwinkle-soft"
        title="Destinations"
        description={`Where ${nouns} can go. The AI reads each name and description and picks the best fit; anything that fits none lands in Unsorted.`}
      >
        {errors.destinations && (
          <p
            role="alert"
            tabIndex={-1}
            data-field="destinations"
            data-invalid="true"
            className="mb-4 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink focus:outline-none"
          >
            {errors.destinations}
          </p>
        )}

        <div ref={listRef} className="space-y-4">
          {regular.length === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-line px-5 py-6 text-center">
              <span aria-hidden className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-soft">
                <Signpost className="h-5 w-5" />
              </span>
              <p className="font-bold">No destinations yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
                Add one for each kind of {noun} you get. Until then, everything lands in{' '}
                {fallbacks[0]?.destination.name.trim() || UNSORTED_NAME}.
              </p>
              {ideas.length > 0 && !atLimit && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-xs font-bold text-ink-soft">Quick add</span>
                  {ideas.map((idea) => (
                    <button
                      key={idea.name}
                      type="button"
                      onClick={() => addDestination(idea)}
                      disabled={disabled}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-lavender hover:bg-lavender-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:opacity-60"
                    >
                      <Plus aria-hidden className="h-3 w-3" /> {idea.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {regular.map((entry, position) => destinationCard(entry, position))}

          <div data-flip-card data-flip-id="destination-add" className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button ref={addButtonRef} variant="secondary" onClick={() => addDestination()} disabled={disabled || atLimit}>
              <Plus className="h-4 w-4" /> Add destination
            </Button>
            <span className="text-xs font-semibold tabular-nums text-ink-soft" aria-live="polite">
              {countText}
            </span>
          </div>

          {fallbacks.map((entry) => destinationCard(entry, 0))}
        </div>
      </Section>

      {variant === 'full' ? (
        <>
          <Section
            id="naming"
            variant={variant}
            icon={<Type className="h-5 w-5" />}
            tint="bg-butter-soft"
            title="File names"
            description={`Build each sorted ${noun}’s new name from tokens the AI fills in.`}
          >
            <NamingTemplateEditor
              kind={kind}
              template={draft.renameTemplate}
              onChange={(renameTemplate) => update({ renameTemplate })}
              tagFields={draft.tagFields}
              destinationNames={regular.map((entry) => entry.destination.name)}
              fallbackName={fallbacks[0]?.destination.name ?? UNSORTED_NAME}
              processName={draft.name}
              limits={limits}
              error={errors.renameTemplate}
              existing={existing}
              disabled={disabled}
            />
          </Section>

          <Section
            id="tags"
            variant={variant}
            icon={<Tags className="h-5 w-5" />}
            tint="bg-sage-soft"
            title="Tag fields"
            description={`Ask the AI for extra details about every ${noun}, then use them in file names.`}
          >
            <TagFieldsEditor kind={kind} fields={draft.tagFields} onChange={changeTagFields} errors={errors} limits={limits} disabled={disabled} />
          </Section>

          <Section
            id="instructions"
            variant={variant}
            icon={<MessageSquareText className="h-5 w-5" />}
            tint="bg-rose-soft"
            title="AI instructions"
            description="Anything else DriveTag should keep in mind when it sorts for this process."
          >
            <InstructionsField
              kind={kind}
              value={draft.instructions}
              onChange={(instructions) => update({ instructions })}
              maxChars={limits.instructionsMax}
              error={errors.instructions}
              disabled={disabled}
            />
          </Section>
        </>
      ) : (
        <p className="process-section flex items-start gap-2.5 rounded-2xl bg-lavender-soft px-4 py-3 text-sm font-semibold leading-relaxed text-ink">
          <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lavender-deep" />
          File names, custom tags and AI instructions can be customized any time later from the process editor.
        </p>
      )}
    </div>
  );
}
