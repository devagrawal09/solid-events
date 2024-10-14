import { Observable, Subject } from "rxjs";

export type Handler<E> = (<O>(transform: (e: E) => O) => Handler<O>) & {
  $: Observable<E>;
};
export type Emitter<E> = (e: E) => void;

function makeHandler<E>($: Observable<E>): Handler<E> {
  function handler<O>(transform: (e: E) => O): Handler<O> {
    const next$ = new Subject<O>();
    $.subscribe((e) => next$.next(transform(e)));
    return makeHandler<O>(next$);
  }

  handler.$ = $;
  return handler;
}

export function createEvent<E = never>(): [Handler<E>, Emitter<E>] {
  const $ = new Subject<E>();
  return [makeHandler($), (e) => $.next(e)] as const;
}
