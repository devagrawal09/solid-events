import { createAsync } from "@solidjs/router";
import { Observable, Subject } from "rxjs";
import { Accessor, createMemo, createSignal, onCleanup } from "solid-js";

export type Handler<E> = (<O>(
  transform: (e: E) => Promise<O> | O
) => Handler<O>) & {
  $: Observable<E>;
};
export type Emitter<E> = (e: E) => void;

function makeHandler<E>($: Observable<E>): Handler<E> {
  function handler<O>(transform: (e: E) => Promise<O> | O): Handler<O> {
    const next$ = new Subject<O>();
    const sub = $.subscribe(async (e) => {
      try {
        next$.next(await transform(e));
      } catch (e) {
        if (!(e instanceof HaltError)) throw e;
        console.info(e.message);
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
  return [makeHandler($), (e) => $.next(e)] as const;
}

export function createSubject<T>(
  init: T,
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
  init: T | undefined,
  ...events: Array<Handler<T | ((prev: T) => T)>>
) {
  const [signal, setSignal] = createSignal(init);
  events.forEach((h) => h(setSignal));
  return signal;
}

export function createAsyncSubject<T>(
  source: () => Promise<T>,
  ...events: Array<Handler<T | ((prev: T) => T)>>
) {
  const asyncSignal = createAsync(source);
  const subject = createMemo(() => createSubject(asyncSignal(), ...events));
  return () => subject()();
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

export function halt(reason?: string): never {
  throw new HaltError(reason);
}
