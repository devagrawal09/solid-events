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
  return [
    makeHandler($),
    (e) => (pureQueue.push(() => $.next(e)), flushQueues()),
  ] as const;
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
    scheduleFlush();
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
      scheduleFlush();
    }
  );
}

let listenerQueue = [] as Function[];

let runningListenerQueue = false;

function flushListeners() {
  if (runningListenerQueue) return;
  runningListenerQueue = true;
  listenerQueue.forEach((fn) => fn());
  listenerQueue = [];
  runningListenerQueue = false;
}

export function createMutationListener<E>(
  handler: Handler<E>,
  effect: (payload: E) => void
) {
  handler((e) => {
    mutationListenerQueue.push(() => effect(e));
    scheduleFlush();
  });
}

let mutationListenerQueue = [] as Function[];

let runningMutationListenerQueue = false;

function flushMutationListeners() {
  if (runningMutationListenerQueue) return;
  runningMutationListenerQueue = true;
  mutationListenerQueue.forEach((fn) => fn());
  mutationListenerQueue = [];
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

let scheduled = false;

function scheduleFlush() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    flushQueues();
  });
}

export function flushQueues() {
  flushPure();
  flushMutationListeners();
  flushListeners();
}

export function introspectQueues() {
  console.log(
    `Queues:`,
    pureQueue.length,
    mutationListenerQueue.length,
    listenerQueue.length
  );
}

export type TopicHandler<T extends Record<string, any>> = {
  <K extends keyof T, O>(
    key: K,
    transform: (e: T[K]) => Promise<O> | O
  ): Handler<O>;
  <K extends keyof T>(key: K): TopicHandler<T[K]>;

  <K1 extends keyof T, K2 extends keyof T[K1], O>(
    key1: K1,
    key2: K2,
    transform: (e: T[K1][K2]) => Promise<O> | O
  ): Handler<O>;
  <K1 extends keyof T, K2 extends keyof T[K1]>(
    key1: K1,
    key2: K2
  ): TopicHandler<T[K1][K2]>;

  <K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2], O>(
    key1: K1,
    key2: K2,
    key3: K3,
    transform: (e: T[K1][K2][K3]) => Promise<O> | O
  ): Handler<O>;
  <K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(
    key1: K1,
    key2: K2,
    key3: K3
  ): TopicHandler<T[K1][K2][K3]>;
};
export type TopicEmitter<T extends Record<string, any>> = {
  (e: T): void;
  <K extends keyof T>(key: K, e: T[K]): void;
  <K1 extends keyof T, K2 extends keyof T[K1]>(
    key1: K1,
    key2: K2,
    e: T[K1][K2]
  ): void;
  <K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(
    key1: K1,
    key2: K2,
    key3: K3,
    e: T[K1][K2][K3]
  ): void;
};

const $EVENT = Symbol("event");
type TopicNode = {
  [$EVENT]?: [Handler<any>, Emitter<any>];
  [key: string]: TopicNode;
};

export function createTopic<T extends Record<string, any>>() {
  const topicTree: TopicNode = {};

  // @ts-expect-error
  const on: TopicHandler<T> = (...key: (string | ((e: any) => any))[]) => {
    const transform = key.pop()!;

    if (typeof transform !== "function") {
      // @ts-expect-error
      return (...args: any[]) => on(...key, transform, ...args);
    }

    const node = (key as string[]).reduce((node, k) => {
      if (!node[k]) node[k] = {};
      return node[k];
    }, topicTree);

    if (!node[$EVENT]) {
      node[$EVENT] = createEvent();
    }

    return node[$EVENT][0](transform);
  };

  const emit: TopicEmitter<T> = (...key: (string | any)[]) => {
    const payload = key.pop()! as any;

    if (typeof payload === "object") {
      Object.keys(payload).forEach((k) => {
        // @ts-expect-error
        emit(...key, k, payload[k]);
      });
      return;
    }

    for (let i = 0; i <= key.length; i++) {
      let p = payload;
      key
        .slice(i)
        .toReversed()
        .forEach((k) => {
          p = { [k]: p };
        });

      const node = key.slice(0, i).reduce((node, k) => node[k], topicTree);
      node[$EVENT]?.[1](p);
    }
  };

  return [on, emit] as const;
}
