import { Observable, Subject } from "rxjs";
import {
  Accessor,
  createComputed,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";

export type Handler<E> = (<O>(
  transform: (e: E) => Promise<O> | O
) => Handler<O>) & {
  $: Observable<E | Promise<E | HaltError>>;
};
export type Emitter<E> = (e: E) => void;

function makeHandler<E>($: Observable<Promise<E | HaltError> | E>): Handler<E> {
  function handler<O>(
    transform: (e: E) => Promise<O> | O,
    syncTransform?: (e: Promise<E | undefined>) => void
  ): Handler<O> {
    const next$ = new Subject<Promise<O | HaltError> | O>();
    const sub = $.subscribe((e) => {
      try {
        if (syncTransform) {
          syncTransform(
            Promise.resolve(e).then((_e) => {
              if (!(_e instanceof HaltError)) return _e;
            })
          );
        }
        const o =
          e instanceof Promise
            ? e
                .then((_e) => {
                  if (_e instanceof HaltError) return _e;
                  return transform(_e);
                })
                .catch(handleError)
            : transform(e);

        pureQueue.push(() => next$.next(o));
      } catch (e) {
        handleError(e);
      }
    });
    onCleanup(() => sub.unsubscribe());
    return makeHandler<O>(next$);
  }

  handler.$ = $;
  return handler;
}

export function createEvent<E = any>(): [Handler<E>, Emitter<E>] {
  const $ = new Subject<E>();
  return [makeHandler($), (e) => ($.next(e), flushQueues())] as const;
}

export function createSubject<T>(
  init: T,
  ...events: Array<Handler<T | ((prev: T) => T)>>
): Accessor<T>;
export function createSubject<T>(
  init: () => T,
  ...events: Array<Handler<T | ((prev: T) => T)>>
): Accessor<T>;
export function createSubject<T>(
  init: undefined,
  ...events: Array<Handler<T | ((prev: T) => T)>>
): Accessor<T | undefined>;
export function createSubject<T>(
  init: T | undefined,
  ...events: Array<Handler<T | ((prev: T) => T)>>
): Accessor<T | undefined>;
export function createSubject<T>(
  init: (() => T) | T | undefined,
  ...events: Array<Handler<T | ((prev: T) => T)>>
) {
  if (typeof init === "function") {
    const memoSubject = createMemo(() =>
      createSubject((init as () => T)(), ...events)
    );
    return () => memoSubject()();
  } else {
    const [signal, setSignal] = createSignal(init);
    events.forEach((h) => h(setSignal));
    return signal;
  }
}

export function createSubjectStore<T extends object = {}>(
  init: () => T,
  ...events: Array<Handler<(prev: T) => void>>
): T;
export function createSubjectStore<T extends object = {}>(
  init: (() => T) | T | undefined,
  ...events: Array<Handler<(prev: T) => void>>
) {
  if (typeof init === "function") {
    const [store, setStore] = createStore<T>(untrack(init));
    createComputed(() => setStore(reconcile(init())));
    events.forEach((event) => event((mutation) => setStore(produce(mutation))));
    return store;
  } else {
    const [store, setStore] = init ? createStore<T>(init) : createStore();
    events.forEach((event) => event((mutation) => setStore(produce(mutation))));
    return store;
  }
}

export class HaltError extends Error {
  constructor(public reason?: string) {
    super(
      reason
        ? "Event propogation halted: " + reason
        : "Event propogation halted"
    );
  }
}

function handleError(e: any) {
  if (!(e instanceof HaltError)) throw e;
  console.info(e.message);
  return e;
}
export function halt(reason?: string): never {
  throw new HaltError(reason);
}

export function createPartition<T>(
  handler: Handler<T>,
  predicate: (arg: T) => boolean
) {
  const trueHandler = handler((p) => (predicate(p) ? p : halt()));
  const falseHandler = handler((p) => (predicate(p) ? halt() : p));
  return [trueHandler, falseHandler] as const;
}

export function createListener<E>(
  handler: Handler<E>,
  effect: (payload: E) => void
) {
  handler((e) => {
    listenerQueue.push(() => effect(e));
  });
}

export function createSyncListener<E>(
  handler: Handler<E>,
  effect: (payload: Promise<E | undefined>) => any
) {
  handler(
    (e) => {},
    // @ts-expect-error
    (p) => {
      listenerQueue.push(() => effect(p));
    }
  );
}

let listenerQueue = [] as Function[];

let runningListenerQueue = false;

function flushListeners() {
  if (runningListenerQueue) return;
  runningListenerQueue = true;
  listenerQueue.forEach((fn) => fn());
  runningListenerQueue = false;
}

export function createMutationListener<E>(
  handler: Handler<E>,
  effect: (payload: E) => void
) {
  handler((e) => {
    mutationListenerQueue.push(() => effect(e));
  });
}

let mutationListenerQueue = [] as Function[];

let runningMutationListenerQueue = false;

function flushMutationListeners() {
  if (runningMutationListenerQueue) return;
  runningMutationListenerQueue = true;
  mutationListenerQueue.forEach((fn) => fn());
  runningMutationListenerQueue = false;
}

let pureQueue = [] as Function[];

let runningPureQueue = false;

function flushPure() {
  if (runningPureQueue) return;
  runningPureQueue = true;
  while (pureQueue.length) pureQueue.shift()!();
  runningPureQueue = false;
}

function flushQueues() {
  flushPure();
  flushMutationListeners();
  flushListeners();
}
