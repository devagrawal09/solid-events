import { createAsync } from "@solidjs/router";
import { Observable, Subject } from "rxjs";
import { createMemo, createSignal, onCleanup } from "solid-js";

export type Handler<E> = (<O>(transform: (e: E) => O) => Handler<O>) & {
  $: Observable<E>;
};
export type Emitter<E> = (e: E) => void;

function makeHandler<E>($: Observable<E>): Handler<E> {
  function handler<O>(transform: (e: E) => O): Handler<O> {
    const next$ = new Subject<O>();
    const sub = $.subscribe((e) => next$.next(transform(e)));
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
